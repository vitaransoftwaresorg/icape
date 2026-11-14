/**
 * PM2 ecosystem for i-CAPE only.
 * Deploy with: pm2 startOrReload /srv/apps/icape/ecosystem.config.cjs --only icape-api
 *              pm2 startOrReload /srv/apps/icape/ecosystem.config.cjs --only icape-web
 * Never use `pm2 restart all` for app deploys.
 */
module.exports = {
  apps: [
    {
      name: "icape-api",
      cwd: "/srv/apps/icape/backend",
      script: "dist/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      time: true,
      error_file: "/home/icape/.pm2/logs/icape-api-error.log",
      out_file: "/home/icape/.pm2/logs/icape-api-out.log",
      merge_logs: true,
    },
    {
      name: "icape-web",
      cwd: "/srv/apps/icape/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      max_memory_restart: "512M",
      time: true,
      error_file: "/home/icape/.pm2/logs/icape-web-error.log",
      out_file: "/home/icape/.pm2/logs/icape-web-out.log",
      merge_logs: true,
    },
  ],
};
