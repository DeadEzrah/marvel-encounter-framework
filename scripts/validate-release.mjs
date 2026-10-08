import fs from "node:fs";

const PROJECT_ID = "marvel-encounter-framework";
const PROJECT_URL = `https://github.com/DeadEzrah/${PROJECT_ID}`;
const EXPECTED_MANIFEST = `https://raw.githubusercontent.com/DeadEzrah/${PROJECT_ID}/main/module.json`;

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const moduleManifest = readJson("module.json");
const packageJson = readJson("package.json");
const releaseTag = process.env.GITHUB_REF_TYPE === "tag"
  ? process.env.GITHUB_REF_NAME
  : process.env.CI_COMMIT_TAG;
const version = moduleManifest.version;
const expectedDownload = `${PROJECT_URL}/releases/download/release-${version}/${PROJECT_ID}-${version}.zip`;

const failures = [];
const assertEqual = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual}`);
};

assertEqual("module ID", moduleManifest.id, PROJECT_ID);
assertEqual("package version", packageJson.version, version);
assertEqual("project URL", moduleManifest.url, PROJECT_URL);
assertEqual("manifest URL", moduleManifest.manifest, EXPECTED_MANIFEST);
assertEqual("download URL", moduleManifest.download, expectedDownload);

if (releaseTag) assertEqual("release tag", releaseTag, `release-${version}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Release metadata is consistent for ${version}.`);
