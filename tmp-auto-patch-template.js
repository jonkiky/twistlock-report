const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const templatePath = path.join(process.cwd(), "lib", "template.docx");
const backupPath = path.join(process.cwd(), "lib", "template.backup.docx");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteral(xml, from, to) {
  const re = new RegExp(escapeRegExp(from), "g");
  return xml.replace(re, to);
}

function main() {
  const binary = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(binary);
  let xml = zip.file("word/document.xml").asText();

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(templatePath, backupPath);
  }

  // Best-effort replacements where instructional text exists in this template.
  xml = replaceLiteral(xml, "The name and acronym of the project", "{projectName}");
  xml = replaceLiteral(xml, "The name of the Technical Project Manager", "{tpm}");
  xml = replaceLiteral(xml, "The date the report was produced", "{reportDate}");
  xml = replaceLiteral(xml, "The name of each microservice (i.e. \u201cfrontend\u201d)", "{microserviceName}");
  xml = replaceLiteral(xml, "The version of each microservice (i.e. 1.0.3)", "{imageTag}");

  // Append a structured placeholder block to guarantee all required tags exist.
  const marker = "AUTO_GENERATED_PLACEHOLDER_BLOCK";
  if (!xml.includes(marker)) {
    const block = `
<w:p><w:r><w:t>${marker}</w:t></w:r></w:p>
<w:p><w:r><w:t>{imageName}</w:t></w:r></w:p>
<w:p><w:r><w:t>{registry}</w:t></w:r></w:p>
<w:p><w:r><w:t>{scanDate}</w:t></w:r></w:p>
<w:p><w:r><w:t>{distro}</w:t></w:r></w:p>
<w:p><w:r><w:t>{totalVulnerabilities}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#vulnerabilities}</w:t></w:r></w:p>
<w:p><w:r><w:t>{cve}</w:t></w:r></w:p>
<w:p><w:r><w:t>{severity}</w:t></w:r></w:p>
<w:p><w:r><w:t>{cvss}</w:t></w:r></w:p>
<w:p><w:r><w:t>{packageName}</w:t></w:r></w:p>
<w:p><w:r><w:t>{packageVersion}</w:t></w:r></w:p>
<w:p><w:r><w:t>{fixStatus}</w:t></w:r></w:p>
<w:p><w:r><w:t>{dateIdentified}</w:t></w:r></w:p>
<w:p><w:r><w:t>{description}</w:t></w:r></w:p>
<w:p><w:r><w:t>{/vulnerabilities}</w:t></w:r></w:p>
`;
    xml = xml.replace("</w:body>", `${block}</w:body>`);
  }

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(templatePath, out);

  console.log("Patched template:", templatePath);
  console.log("Backup created:", backupPath);
}

main();
