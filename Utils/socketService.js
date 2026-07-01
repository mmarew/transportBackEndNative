import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import validateJWT from "../utils/JWT/ValidateJWT";
import API_URL_AXIOS from "./AxiosServices";
import store from "../Redux/store/Store";
import { setIsLoading } from "../Redux/Slices/driverSlice";

let socket = null;
let cachedToken = null;
let cachedPhoneNumber = null;

const getCredentials = async () => {
  if (cachedToken && cachedPhoneNumber) {
    return { token: cachedToken, phoneNumber: cachedPhoneNumber };
  }
  const token = await AsyncStorage.getItem("token");
  if (!token) {
    throw new Error("No token found");
  }
  const validateData = validateJWT(token);
  const phoneNumber = validateData?.phoneNumber;
  if (!phoneNumber) {
    throw new Error("Please add your phone number in your profile");
  }
  cachedToken = token;
  cachedPhoneNumber = phoneNumber;
  return { token, phoneNumber };
};

export const initSocket = async () => {
  if (socket && socket?.connected) {
    return;
  }
  store.dispatch(setIsLoading(true));

  const { token, phoneNumber } = await getCredentials();

  socket = io(API_URL_AXIOS, {
    transports: ["websocket"],
    autoConnect: true,
    auth: {
      user: "driver",
      phoneNumber,
      token: `Bearer ${token}`,
    },
  });
  store.dispatch(setIsLoading(false));

  return socket;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
  }
};

export const emitEvent = (event, data) => {
  if (socket && socket.connected) {
    socket.emit(event, data);
  } else {
  }
};

export const listenToEvent = (event, callback) => {
  if (!socket) {
    return;
  }

  socket.on(event, callback);
};
