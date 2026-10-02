import { spawnSync } from "node:child_process";

const containerName = "eevents-test-postgres";
const ownershipLabel = "eevents.test-db";

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
  if (label !== null) {
    if (label !== "true") {
      console.error(`Container ${containerName} exists but is not owned by this test setup.`);
      process.exit(1);
    }
    console.log(`Using existing isolated test database container ${containerName}.`);
  } else {
    docker([
      "run",
      "--detach",
      "--rm",
      `--name=${containerName}`,
      `--label=${ownershipLabel}=true`,
      "--publish=127.0.0.1:55433:5432",
      "--env=POSTGRES_DB=eevents_test",
      "--env=POSTGRES_USER=eevents",
      "--env=POSTGRES_PASSWORD=eevents_test_only",
      "--health-cmd=pg_isready -U eevents -d eevents_test",
      "--health-interval=2s",
      "--health-timeout=3s",
      "--health-retries=30",
      "postgres:17-alpine",
    ]);
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = docker(
      ["inspect", "--format={{.State.Health.Status}}", containerName],
      { allowFailure: true },
    );
    if (health.status !== 0) {
      console.error(`Test database container ${containerName} stopped before becoming healthy.`);
      process.exit(1);
    }
    if (health.stdout.trim() === "healthy") {
      console.log("Isolated test database is ready on localhost:55433.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  console.error("Timed out waiting for the isolated test database to become healthy.");
  process.exit(1);
}

function stop() {
  const label = existingContainerLabel();
  if (label === null) {
    console.log("No isolated test database container is running.");
    return;
  }
  if (label !== "true") {
    console.error(`Container ${containerName} exists but is not owned by this test setup.`);
    process.exit(1);
  }
  docker(["rm", "--force", containerName]);
  console.log("Removed the isolated test database container and its data.");
}

const command = process.argv[2];
if (command === "up") await start();
else if (command === "down") stop();
else {
  console.error("Usage: node scripts/test-db.mjs <up|down>");
  process.exit(2);
}
