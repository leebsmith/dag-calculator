// The Sugars section of the Fermentables card: the section disclosure and the
// pin-preview disclosure inside it. The header counts the rows and sums the mass
// they contribute to the bill, the way the grist headers do.

import { gristSectionMeta } from "./gristRows.js";

export function sugarSectionState() {
  return {
    sugarSectionOpen: true,
    latePinPanelOpen: false,

    toggleSugarSection() {
      this.sugarSectionOpen = !this.sugarSectionOpen;
    },

    toggleLatePinPanel() {
      this.latePinPanelOpen = !this.latePinPanelOpen;
    },
  };
}

export function sugarSectionMetaDescriptors() {
  return {
    sugarSectionMeta: {
      configurable: true,
      get() {
        return gristSectionMeta(this.sugarList, this.sugarCountLabel, this.sugarMassField);
      },
    },
  };
}
