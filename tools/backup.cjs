const { backup } = require("../server-backup.cjs");
try {
  console.log(backup());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
