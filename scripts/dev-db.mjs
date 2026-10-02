import { spawnSync } from "node:child_process";

const containerName = "eevents-dev-postgres";
const ownershipLabel = "eevents.dev-db";

function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error) {
    console.error(`Could not run Docker: ${result.error.message}`);
    process.exit(1);
  }
  if (!allowFailure && result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result;
}

function existingContainerLabel() {
  const result = docker(
    ["inspect", `--format={{ index .Config.Labels "${ownershipLabel}" }}`, containerName],
    { allowFailure: true },
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

async function start() {
  const label = existingContainerLabel();
  if (label !== null && label !== "true") {
    console.error(`Container ${containerName} exists but is not owned by this project.`);
    process.exit(1);
  }

  if (label === null) {
    docker([
      "run",
      "--detach",
      `--name=${containerName}`,
      `--label=${ownershipLabel}=true`,
      "--publish=127.0.0.1:55432:5432",
      "--env=POSTGRES_DB=eevents",
      "--env=POSTGRES_USER=eevents",
      "--env=POSTGRES_PASSWORD=eevents_dev_only",
      "--volume=eevents-dev-postgres-data:/var/lib/postgresql/data",
      "--health-cmd=pg_isready -U eevents -d eevents",
      "--health-interval=2s",
      "--health-timeout=3s",
      "--health-retries=30",
      "postgres:17-alpine",
    ]);
  } else {
    const state = docker(["inspect", "--format={{.State.Running}}", containerName]);
    if (state.stdout.trim() !== "true") docker(["start", containerName]);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = docker(
      ["inspect", "--format={{.State.Health.Status}}", containerName],
      { allowFailure: true },
    );
    if (health.status !== 0) {
      console.error(`Local database container ${containerName} stopped unexpectedly.`);
      process.exit(1);
    }
    if (health.stdout.trim() === "healthy") {
      console.log("Local development database is ready on localhost:55432.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  console.error("Timed out waiting for the local development database.");
  process.exit(1);
}

function stop() {
  const label = existingContainerLabel();
  if (label === null) {
    console.log("No local development database container is running.");
    return;
  }
  if (label !== "true") {
    console.error(`Container ${containerName} exists but is not owned by this project.`);
    process.exit(1);
  }
  docker(["stop", containerName]);
  console.log("Stopped the local development database. Its Docker volume was retained.");
}

const command = process.argv[2];
if (command === "up") await start();
else if (command === "down") stop();
else {
  console.error("Usage: node scripts/dev-db.mjs <up|down>");
  process.exit(2);
}
