import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.instagram.arena',
  appName: 'Instagram Arena',
  webDir: 'public',
  server: {
    url: 'https://instagram-arena.vercel.app',
    cleartext: true
  }
};

export default config;
