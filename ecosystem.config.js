module.exports = {
  apps: [
    {
      name: "my-app-3000",
      script: "./App.js",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      autorestart: true, // Enable auto-restart
      watch: false, // Disable file watching (for production)
      max_memory_restart: "1G", // Restart if memory exceeds 1GB
      min_uptime: "5000", // Minimum uptime before considered 'stable'
      kill_timeout: 3000, // Wait 3 seconds before force-killing
      restart_delay: 5000, // Wait 5 seconds before restarting
    },
    {
      name: "my-app-3001",
      script: "./App.js",
      env: {
        PORT: 3001,
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "5000",
      kill_timeout: 3000,
      restart_delay: 5000,
    },
    {
      name: "my-app-3002",
      script: "./App.js",
      env: {
        PORT: 3002,
        NODE_ENV: "production",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      min_uptime: "5000",
      kill_timeout: 3000,
      restart_delay: 5000,
    },
  ],
};
