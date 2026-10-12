import Alpine from "alpinejs";

import "./tokens.css";
import "./style.css";

import { createCalculatorApp } from "./adapters/engineAdapter.js";

Alpine.data("calculator", () => createCalculatorApp());

Alpine.start();
