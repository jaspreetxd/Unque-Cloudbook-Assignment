import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LeadsScreen from "./src/screens/LeadsScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LeadsScreen />
    </SafeAreaProvider>
  );
}
