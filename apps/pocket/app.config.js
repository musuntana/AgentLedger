// Cloudflare exports Pocket below /pocket. Local/native commands retain the
// existing config and root asset paths unless the build explicitly sets a base.
module.exports = ({ config }) => ({
  ...config,
  ...(process.env.AGENTLEDGER_WEB_BASE_PATH ? {
    experiments: {
      ...config.experiments,
      baseUrl: process.env.AGENTLEDGER_WEB_BASE_PATH,
    },
  } : {}),
});
