import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import { dialogFocus, dialogRestore } from "../../frontend/src/adapters/modalFocus.js";

function makeDoc() {
  return { activeElement: null };
}

function makeItem(doc, { visible = true } = {}) {
  return {
    offsetParent: visible ? {} : null,
    focused: 0,
    focus() {
      this.focused += 1;
      doc.activeElement = this;
    },
  };
}

function makeContainer(doc, items = []) {
  const listeners = new Set();
  return {
    focused: 0,
    listeners,
    querySelectorAll() {
      return items;
    },
    addEventListener(_type, handler) {
      listeners.add(handler);
    },
    removeEventListener(_type, handler) {
      listeners.delete(handler);
    },
    focus() {
      this.focused += 1;
      doc.activeElement = this;
    },
    dispatch(event) {
      for (const handler of listeners) handler(event);
    },
  };
}

function keyEvent(key, shiftKey = false) {
  return {
    key,
    shiftKey,
    prevented: 0,
    preventDefault() {
      this.prevented += 1;
    },
  };
}

// Synchronous frame so focus lands inside the assertion window.
const raf = (fn) => fn();

function env(doc, requestAnimationFrame = raf) {
  return { document: doc, requestAnimationFrame };
}

beforeEach(() => {
  dialogRestore();
});

test("opening a dialog focuses its container", () => {
  const doc = makeDoc();
  const container = makeContainer(doc);

  dialogFocus(container, true, env(doc));

  assert.equal(container.focused, 1);
  assert.equal(doc.activeElement, container);
  assert.equal(container.listeners.size, 1);
});

test("Tab on the last control wraps to the first", () => {
  const doc = makeDoc();
  const items = [makeItem(doc), makeItem(doc), makeItem(doc)];
  const container = makeContainer(doc, items);
  dialogFocus(container, true, env(doc));

  doc.activeElement = items[2];
  const event = keyEvent("Tab");
  container.dispatch(event);

  assert.equal(event.prevented, 1);
  assert.equal(items[0].focused, 1);
});

test("Shift+Tab on the first control wraps to the last", () => {
  const doc = makeDoc();
  const items = [makeItem(doc), makeItem(doc), makeItem(doc)];
  const container = makeContainer(doc, items);
  dialogFocus(container, true, env(doc));

  doc.activeElement = items[0];
  const event = keyEvent("Tab", true);
  container.dispatch(event);

  assert.equal(event.prevented, 1);
  assert.equal(items[2].focused, 1);
});

test("Tab in the middle of the list is left to the browser", () => {
  const doc = makeDoc();
  const items = [makeItem(doc), makeItem(doc), makeItem(doc)];
  const container = makeContainer(doc, items);
  dialogFocus(container, true, env(doc));

  doc.activeElement = items[1];
  const event = keyEvent("Tab");
  container.dispatch(event);

  assert.equal(event.prevented, 0);
  assert.equal(items[0].focused, 0);
  assert.equal(items[2].focused, 0);
});

test("keys other than Tab are ignored", () => {
  const doc = makeDoc();
  const items = [makeItem(doc)];
  const container = makeContainer(doc, items);
  dialogFocus(container, true, env(doc));

  doc.activeElement = items[0];
  const event = keyEvent("Escape");
  container.dispatch(event);

  assert.equal(event.prevented, 0);
  assert.equal(items[0].focused, 0);
});

test("an empty dialog keeps focus on the container", () => {
  const doc = makeDoc();
  const container = makeContainer(doc, []);
  dialogFocus(container, true, env(doc));
  const before = container.focused;

  const event = keyEvent("Tab");
  container.dispatch(event);

  assert.equal(event.prevented, 1);
  assert.equal(container.focused, before + 1);
});

test("hidden controls are skipped by the Tab order", () => {
  const doc = makeDoc();
  const hidden = makeItem(doc, { visible: false });
  const first = makeItem(doc);
  const last = makeItem(doc);
  const container = makeContainer(doc, [hidden, first, last]);
  dialogFocus(container, true, env(doc));

  doc.activeElement = last;
  container.dispatch(keyEvent("Tab"));

  assert.equal(first.focused, 1);
  assert.equal(hidden.focused, 0);
});

test("closing restores focus to the element that opened the dialog", () => {
  const doc = makeDoc();
  const trigger = makeItem(doc);
  trigger.focus();
  const container = makeContainer(doc, [makeItem(doc)]);

  dialogFocus(container, true, env(doc));
  assert.equal(container.listeners.size, 1);

  dialogRestore();

  assert.equal(trigger.focused, 2);
  assert.equal(container.listeners.size, 0);
  assert.equal(doc.activeElement, trigger);
});

test("closing a dialog that is not the active one leaves the trap intact", () => {
  const doc = makeDoc();
  const container = makeContainer(doc, [makeItem(doc)]);
  const other = makeContainer(doc, []);

  dialogFocus(container, true, env(doc));
  dialogFocus(other, false, env(doc));
  assert.equal(container.listeners.size, 1);

  dialogFocus(container, false, env(doc));
  assert.equal(container.listeners.size, 0);
});

test("opening a second dialog moves the trap and remembers the original trigger", () => {
  const doc = makeDoc();
  const trigger = makeItem(doc);
  trigger.focus();
  const a = makeContainer(doc, [makeItem(doc)]);
  const b = makeContainer(doc, [makeItem(doc)]);

  dialogFocus(a, true, env(doc));
  dialogFocus(b, true, env(doc));

  assert.equal(a.listeners.size, 0);
  assert.equal(b.listeners.size, 1);
  assert.equal(trigger.focused, 2);
  assert.equal(doc.activeElement, b);

  dialogRestore();
  assert.equal(trigger.focused, 3);
});

test("re-opening the same container does not stack handlers or re-anchor focus", () => {
  const doc = makeDoc();
  const trigger = makeItem(doc);
  trigger.focus();
  const container = makeContainer(doc, [makeItem(doc)]);

  dialogFocus(container, true, env(doc));
  const focused = container.focused;
  dialogFocus(container, true, env(doc));

  assert.equal(container.listeners.size, 1);
  assert.equal(container.focused, focused);
});

test("a deferred focus frame does not touch a dialog closed in the same tick", () => {
  const doc = makeDoc();
  let pending = null;
  const container = makeContainer(doc, []);

  dialogFocus(container, true, env(doc, (fn) => (pending = fn)));
  assert.equal(container.focused, 0);

  dialogFocus(container, false, env(doc, (fn) => (pending = fn)));
  pending();
  assert.equal(container.focused, 0);
});

test("no document means no DOM work", () => {
  const container = makeContainer(makeDoc(), []);

  dialogFocus(container, true, { document: null });
  dialogFocus(null, true, { document: null });

  assert.equal(container.focused, 0);
  assert.equal(container.listeners.size, 0);
});

test("a missing frame scheduler focuses synchronously", () => {
  const doc = makeDoc();
  const container = makeContainer(doc, []);

  dialogFocus(container, true, { document: doc, requestAnimationFrame: null });

  assert.equal(container.focused, 1);
});
