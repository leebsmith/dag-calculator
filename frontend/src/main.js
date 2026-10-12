import Alpine from "alpinejs";

import "./tokens.css";
import "./style.css";

import { createCalculatorApp } from "./adapters/engineAdapter.js";
import { createStepApp } from "./adapters/stepAdapter.js";

Alpine.data("calculator", () => createCalculatorApp());
Alpine.data("stepCalculator", () => createStepApp());

Alpine.start();
