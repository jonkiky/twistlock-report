const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const templatePath = path.join(process.cwd(), "lib", "template.docx");
const requiredTags = [
  "{projectName}",
  "{tpm}",
  "{reportDate}",
  "{microserviceName}",
  "{imageName}",
  "{imageTag}",
  "{registry}",
  "{scanDate}",
  "{distro}",
  "{totalVulnerabilities}",
  "{#vulnerabilities}",
  "{cve}",
  "{severity}",
  "{cvss}",
  "{packageName}",
  "{packageVersion}",
  "{fixStatus}",
  "{dateIdentified}",
  "{description}",
  "{/vulnerabilities}",
];

function main() {
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const plainText = xml
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");

  const missing = requiredTags.filter(
    (tag) => !xml.includes(tag) && !plainText.includes(tag)
  );

  if (missing.length === 0) {
    console.log("Template validation passed: all required placeholders exist.");
    process.exit(0);
  }

  console.log("Template validation failed. Missing placeholders:");
  for (const tag of missing) {
    console.log(`- ${tag}`);
  }
  process.exit(1);
}

main();
