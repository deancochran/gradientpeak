const changeEmailMock = jest.fn(async (_input?: unknown) => ({ error: null }));
const changePasswordMock = jest.fn(async (_input?: unknown) => ({ error: null }));
const deleteUserMock = jest.fn(async (_input?: unknown) => ({ error: null }));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    changeEmail: (input: unknown) => changeEmailMock(input),
    changePassword: (input: unknown) => changePasswordMock(input),
    deleteUser: (input: unknown) => deleteUserMock(input),
  },
  getEmailVerificationCallbackUrl: () => "gradientpeak://callback",
}));

import {
  deleteMobileAccount,
  updateMobileEmail,
  updateMobilePassword,
} from "../account-management";

describe("account-management mobile auth boundary", () => {
  beforeEach(() => {
    changeEmailMock.mockClear();
    changePasswordMock.mockClear();
    deleteUserMock.mockClear();
  });

  it("delegates email updates through the auth client adapter", async () => {
    await updateMobileEmail({ newEmail: "new@test.com" });

    expect(changeEmailMock).toHaveBeenCalledWith({
      newEmail: "new@test.com",
      callbackURL: "gradientpeak://callback",
    });
  });

  it("delegates password updates through the auth client adapter", async () => {
    await updateMobilePassword({
      currentPassword: "old-password",
      newPassword: "new-password",
    });

    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password",
    });
  });

  it("delegates account deletion through the auth client adapter", async () => {
    await deleteMobileAccount();

    expect(deleteUserMock).toHaveBeenCalledWith({});
  });
});
