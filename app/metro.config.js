// metro.config.js — required for Expo 52 web bundling with Metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable CSS support (required for react-native-web on Metro)
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;
