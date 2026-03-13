const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const templatePath = path.join(process.cwd(), "lib", "template.docx");
const required = [
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

function stripTags(xml) {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const binary = fs.readFileSync(templatePath, "binary");
const zip = new PizZip(binary);
let xml = zip.file("word/document.xml").asText();
const plain = stripTags(xml);

const missing = required.filter((tag) => !xml.includes(tag) && !plain.includes(tag));
if (missing.length === 0) {
  console.log("No missing placeholders.");
  process.exit(0);
}

const forced = missing
  .map((tag) => `<w:p><w:r><w:t>${tag}</w:t></w:r></w:p>`)
  .join("\n");

xml = xml.replace("</w:body>", `${forced}\n</w:body>`);
zip.file("word/document.xml", xml);
fs.writeFileSync(templatePath, zip.generate({ type: "nodebuffer" }));

console.log("Injected missing placeholders:", missing.join(", "));
