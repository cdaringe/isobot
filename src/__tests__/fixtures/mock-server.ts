import * as msw from "msw";
import { SetupServerApi, setupServer } from "msw/node";

export const withMockServer = (
  fn: (
    mockServer: SetupServerApi,
    tk: {
      msw: typeof msw;
    }
  ) => Promise<void>
) => {
  const mockServer = setupServer();
  return async function withMockServerImpl() {
    try {
      await fn(mockServer, { msw });
    } finally {
      mockServer.close();
    }
  };
};
