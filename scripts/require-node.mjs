const requiredMajor = 20;
const current = process.versions.node;
const currentMajor = Number(current.split('.')[0]);

if (!Number.isFinite(currentMajor) || currentMajor < requiredMajor) {
  console.error(
    `Node ${requiredMajor}+ is required for this project. Current runtime: ${current}.`,
  );
  console.error('Use `nvm use`, Volta, or another Node manager before running npm scripts.');
  process.exit(1);
}
