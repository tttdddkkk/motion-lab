export default {
  framework: '@storybook/html-vite',
  stories: ['../stories/**/*.stories.js'],
  addons: ['@storybook/addon-vitest'],
  core: { disableTelemetry: true },
};
