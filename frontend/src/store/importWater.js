// Water on an import: the profile is the user's constraint, not the page's.
//
// A batch's identity carries the water *source*; the target profile is a separate
// selection, locked in the editor until one is chosen. So an import has no targets
// until the user says what they want, and the gate can only say so. This store
// takes that decision here, where the finding appears, and reads back the
// prescription the boundary produced once targets exist.

export function waterActions({ profiles = () => [] } = {}) {
  return {
    get targetProfiles() {
      return profiles();
    },

    get targetProfileId() {
      return this.record?.target_profile_id ?? null;
    },

    get targetProfile() {
      const id = this.targetProfileId;
      const option = id ? this.targetProfiles.find((entry) => entry.value === id) : null;
      return option ? { id: option.value, ...(option.record ?? {}) } : null;
    },

    setTargetProfile(profileId) {
      if (!this.record) return;
      this.record = { ...this.record, target_profile_id: profileId || null };
      this.dirty = true;
      this.checkError = null;
      this.revision += 1;
    },

    // What the water boundary prescribed, as the gate reported it.
    get waterSummary() {
      return this.gate?.water ?? null;
    },
  };
}

