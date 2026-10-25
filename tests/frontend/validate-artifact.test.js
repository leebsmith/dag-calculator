import test from "node:test";
import assert from "node:assert/strict";

import { validateArtifact } from "../../frontend/src/engine/validate.js";
import { validateRootDefaults } from "../../frontend/src/engine/units.js";
import { artifact } from "../guards/util.js";

function clone() {
  return structuredClone(artifact());
}

function nodeId(doc, kind) {
  const entry = Object.entries(doc.nodes).find(([, node]) => node.kind === kind);
  assert.ok(entry, `fixture has no ${kind} node`);
  return entry[0];
}

function node(doc, kind) {
  return doc.nodes[nodeId(doc, kind)];
}

test("accepts the committed artifact unchanged", () => {
  const doc = clone();
  assert.equal(validateArtifact(doc), doc);
});

test("rejects a malformed top-level document", () => {
  assert.throws(() => validateArtifact(null), /must be an object/);
  assert.throws(() => validateArtifact("artifact"), /must be an object/);

  const noVersion = clone();
  delete noVersion.schema_version;
  assert.throws(() => validateArtifact(noVersion), /numeric "schema_version"/);

  const future = clone();
  future.schema_version = 99;
  assert.throws(() => validateArtifact(future), /Unsupported schema_version 99/);

  const noNodes = clone();
  delete noNodes.nodes;
  assert.throws(() => validateArtifact(noNodes), /"nodes" object/);
});

test("rejects unknown node kinds", () => {
  const doc = clone();
  node(doc, "derived").kind = "mystery";
  assert.throws(() => validateArtifact(doc), /unknown kind "mystery"/);
});

test("rejects root dimension and default drift", () => {
  const badDimension = clone();
  node(badDimension, "root").dimension = "nope";
  assert.throws(() => validateArtifact(badDimension), /unknown dimension "nope"/);

  const badDefault = clone();
  node(badDefault, "root").default = { ref: "nope.missing" };
  assert.throws(() => validateArtifact(badDefault), /Root ".*" default references unknown node\/field/);
});

test("rejects collection and selection schema or ref drift", () => {
  const badItem = clone();
  node(badItem, "collection").item_schema = "nope";
  assert.throws(() => validateArtifact(badItem), /Collection ".*" references unknown schema "nope"/);

  const badSchema = clone();
  node(badSchema, "selection").output = { schema: "nope" };
  assert.throws(() => validateArtifact(badSchema), /Selection ".*" references unknown schema "nope"/);

  const missingOutput = clone();
  delete node(missingOutput, "selection").output;
  assert.throws(() => validateArtifact(missingOutput), /Selection ".*" must declare an "output\.schema"/);

  const badRef = clone();
  node(badRef, "selection").ref = "nope";
  assert.throws(() => validateArtifact(badRef), /Selection ".*" ref references unknown node\/field/);
});

test("rejects choice taxonomy and default drift", () => {
  const badTaxonomy = clone();
  node(badTaxonomy, "choice").taxonomy = "nope";
  assert.throws(() => validateArtifact(badTaxonomy), /references unknown taxonomy "nope"/);

  const badDefault = clone();
  const choice = node(badDefault, "choice");
  choice.default = "__not-a-member__";
  assert.throws(() => validateArtifact(badDefault), /is not a member of taxonomy/);
});

test("rejects derived inputs, output, and expression drift", () => {
  const badInputs = clone();
  node(badInputs, "derived").inputs = null;
  assert.throws(() => validateArtifact(badInputs), /must declare an "inputs" object/);

  const badInputRef = clone();
  const derivedInput = node(badInputRef, "derived");
  derivedInput.inputs = { ...derivedInput.inputs, bogus: "nope.missing" };
  assert.throws(() => validateArtifact(badInputRef), /input "bogus" references unknown/);

  const noOutput = clone();
  delete node(noOutput, "derived").output;
  assert.throws(() => validateArtifact(noOutput), /must declare an "output"/);

  const twoKinds = clone();
  node(twoKinds, "derived").output = { dimension: "volume_l", taxonomy: "style_family" };
  assert.throws(() => validateArtifact(twoKinds), /exactly one of dimension\/taxonomy\/boolean/);

  const unknownConst = clone();
  node(unknownConst, "derived").expr = { const: "NOPE" };
  assert.throws(() => validateArtifact(unknownConst), /unknown constant "NOPE"/);

  const unknownFn = clone();
  node(unknownFn, "derived").expr = { call: "nope" };
  assert.throws(() => validateArtifact(unknownFn), /unknown function "nope"/);

  const unknownNested = clone();
  node(unknownNested, "derived").expr = { args: [{ call: "nope" }] };
  assert.throws(() => validateArtifact(unknownNested), /unknown function "nope"/);
});

test("rejects boundary binding, input, and output drift", () => {
  const noBinding = clone();
  delete node(noBinding, "boundary").binding;
  assert.throws(() => validateArtifact(noBinding), /must declare a "binding"/);

  const badInputs = clone();
  node(badInputs, "boundary").inputs = null;
  assert.throws(() => validateArtifact(badInputs), /must declare an "inputs" object/);

  const badInputRef = clone();
  const boundary = node(badInputRef, "boundary");
  boundary.inputs = { ...boundary.inputs, bogus: "nope.missing" };
  assert.throws(() => validateArtifact(badInputRef), /Boundary ".*" input "bogus" references unknown/);

  const noOutputs = clone();
  node(noOutputs, "boundary").outputs = null;
  assert.throws(() => validateArtifact(noOutputs), /must declare an "outputs" object/);

  const badOutputDimension = clone();
  const [outputName] = Object.keys(node(badOutputDimension, "boundary").outputs);
  node(badOutputDimension, "boundary").outputs[outputName] = { dimension: "nope" };
  assert.throws(() => validateArtifact(badOutputDimension), /has unknown dimension "nope"/);

  const badOutputTaxonomy = clone();
  node(badOutputTaxonomy, "boundary").outputs[outputName] = { taxonomy: "nope" };
  assert.throws(() => validateArtifact(badOutputTaxonomy), /has unknown taxonomy "nope"/);

  const badCollection = clone();
  badCollection.nodes["solver.hops"].outputs.boil_rows = {
    type: "collection",
    item_schema: "nope",
  };
  assert.throws(() => validateArtifact(badCollection), /unknown item_schema "nope"/);

  const noKind = clone();
  noKind.nodes["solver.hops"].outputs.boil_rows = {};
  assert.throws(
    () => validateArtifact(noKind),
    /must declare a dimension, taxonomy, boolean, or collection type/
  );
});

test("rejects primitive schema drift", () => {
  const [schemaId, schema] = Object.entries(clone().primitive_schemas)[0];
  const field = Object.keys(schema)[0];

  const nonObject = clone();
  nonObject.primitive_schemas[schemaId][field] = "string";
  assert.throws(() => validateArtifact(nonObject), /must be an object/);

  const badDimension = clone();
  badDimension.primitive_schemas[schemaId][field] = { dimension: "nope" };
  assert.throws(() => validateArtifact(badDimension), /references unknown dimension "nope"/);

  const badTaxonomy = clone();
  badTaxonomy.primitive_schemas[schemaId][field] = { taxonomy: "nope" };
  assert.throws(() => validateArtifact(badTaxonomy), /references unknown taxonomy "nope"/);

  const badType = clone();
  badType.primitive_schemas[schemaId][field] = { type: "number" };
  assert.throws(() => validateArtifact(badType), /unsupported type "number"/);
});

test("rejects relation drift", () => {
  const badEntry = clone();
  badEntry.relations = [null];
  assert.throws(() => validateArtifact(badEntry), /Each relation must be an object with an id/);

  const noId = clone();
  noId.relations = [{ predicate: {} }];
  assert.throws(() => validateArtifact(noId), /Each relation must be an object with an id/);

  const badPredicate = clone();
  badPredicate.relations = [
    { id: "r1", predicate: { op: "le", lhs: { ref: "nope.missing" }, rhs: { const: 1 } } },
  ];
  assert.throws(() => validateArtifact(badPredicate), /Relation "r1" references unknown/);
});


test("root defaults must infer the root dimension", () => {
  assert.equal(validateRootDefaults(clone()), undefined);

  const wrongDimension = clone();
  wrongDimension.nodes["batch.target_abv"].default = { ref: "batch.v_ferm" };
  assert.throws(
    () => validateRootDefaults(wrongDimension),
    /declares dimension "abv" but its default infers "volume"/
  );

  const stringDefault = clone();
  stringDefault.nodes["batch.v_ferm"].default = "oops";
  assert.throws(
    () => validateRootDefaults(stringDefault),
    /has a string default but dimension "volume"/
  );

  const mixedBranches = clone();
  mixedBranches.nodes["batch.target_abv"].default = {
    op: "if",
    args: [
      { op: "gt", args: [{ ref: "batch.v_ferm" }, 0] },
      { ref: "batch.v_ferm" },
      { ref: "batch.target_ibu" },
    ],
  };
  assert.throws(() => validateRootDefaults(mixedBranches), /if branches with dimensions/);
});
