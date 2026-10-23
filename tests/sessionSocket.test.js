"use strict";

const { socketIO } = require("../Utils/WsServerResponder");
const {
  joinSessionRoom,
  disconnectSessionSockets,
  sessionRoom,
} = require("../Utils/SessionSocket");

describe("SessionSocket", () => {
  afterEach(() => {
    socketIO.io = undefined;
  });

  test("joinSessionRoom joins the room named after the session", () => {
    const join = jest.fn();
    const socket = { join };

    expect(joinSessionRoom(socket, "sid-123")).toBe(true);
    expect(join).toHaveBeenCalledWith("session:sid-123");
  });

  test("joinSessionRoom is a no-op without a session id", () => {
    const join = jest.fn();

    expect(joinSessionRoom({ join }, null)).toBe(false);
    expect(join).not.toHaveBeenCalled();
  });

  test("disconnectSessionSockets disconnects every socket in the room", () => {
    const disconnectSockets = jest.fn();
    const to = jest.fn(() => ({ disconnectSockets }));
    const room = new Set(["socket-1", "socket-2"]);
    socketIO.io = {
      to,
      sockets: { adapter: { rooms: new Map([[sessionRoom("sid-123"), room]]) } },
    };

    expect(disconnectSessionSockets("sid-123")).toBe(2);
    expect(to).toHaveBeenCalledWith("session:sid-123");
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  test("disconnectSessionSockets is a no-op before Socket.IO starts", () => {
    expect(disconnectSessionSockets("sid-123")).toBe(0);
  });
});
