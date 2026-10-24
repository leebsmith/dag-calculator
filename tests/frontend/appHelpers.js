import { createStepApp } from "../../frontend/src/adapters/stepAdapter.js";

export const TEST_YEAST_ID = "fermentis-safale-american-ale-us-05";

export function createTestApp(options = {}) {
  const app = createStepApp(options);
  app.selectYeast(TEST_YEAST_ID);
  const loadState = app.loadState.bind(app);
  app.loadState = async (state) => {
    await loadState(state);
    if (!app.engine.get("batch.yeast_id")) {
      app.selectYeast(TEST_YEAST_ID);
      if (options.useHttp) await app.solveNow();
      else app.compute();
    } else {
      app.compute();
    }
  };
  return app;
}
