import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import validateJWT from "../utils/JWT/ValidateJWT";
import API_URL_AXIOS from "./AxiosServices";
import store from "../Redux/store/Store";
import { setIsLoading } from "../Redux/Slices/driverSlice";

let socket = null;

const getSocketUrl = async () => {
  const token = await AsyncStorage.getItem("token");
  if (!token) {
    throw new Error("No token found");
  }

  const validateData = validateJWT(token);
  const phoneNumber = validateData?.phoneNumber;
  console.log("phoneNumber in ws:", phoneNumber);

  if (!phoneNumber) {
    throw new Error("Please add your phone number in your profile");
  }
  return `${API_URL_AXIOS}?user=driver&phoneNumber=${phoneNumber}&token=Bearer%20${token}`;
};

export const initSocket = async () => {
  console.log("@socket111");

  if (socket && socket?.connected) {
    console.log("✅ Socket already connected");
    return;
  }
  store.dispatch(setIsLoading(true));
  const SOCKET_URL = await getSocketUrl();

  socket = io(SOCKET_URL, {
    transports: ["websocket"], // Ensures reliable connection in React Native
    autoConnect: true, // Allow auto connection when needed
  });
  store.dispatch(setIsLoading(false));
  socket.on("connect", () => {
    console.log("✅ Connected to Socket.IO server");
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected from Socket.IO server");
  });

  socket.on("error", (error) => {
    console.error("⚠️ Socket error:", error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
    console.log("🚫 Socket disconnected");
  }
};

export const emitEvent = (event, data) => {
  if (socket && socket.connected) {
    console.log(`📤 Emitting event: ${event}`, data);
    socket.emit(event, data);
  } else {
    console.warn("⚠️ Cannot emit, socket is not connected!");
  }
};

export const listenToEvent = (event, callback) => {
  if (!socket) {
    console.warn("⚠️ Socket is not initialized yet.");
    return;
  }

  console.log(`🔔 Listening for event: ${event}`);
  socket.on(event, callback);
};
