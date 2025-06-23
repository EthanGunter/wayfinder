// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const isDev = true; //TODO I don't know where this is defined yet //process.env.NODE_ENV === 'development';;

const config: CapacitorConfig = {
  appId: 'com.wayfinder.app',
  appName: 'Wayfinder',
  webDir: 'build',
  // 💡 NEW: Optional for Live Reload during development
  ...(isDev && {server: {
    url: 'http://192.168.1.7:5173', // Replace YOUR_LOCAL_IP with your machine's IP (e.g., 192.168.1.X)
    cleartext: true // Required for HTTP connections
  }})
};

export default config;