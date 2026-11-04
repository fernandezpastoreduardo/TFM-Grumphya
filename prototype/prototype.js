const domainInput = document.querySelector("#domain-input");
const grumphyaReport = document.querySelector("#grumphya-report");
const simulatedReport = document.querySelector("#simulated-report");
const domainSubmit = document.querySelector("#domain-submit");

function getHostname(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  try {
    const normalizedValue = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
      ? trimmedValue
      : `https://${trimmedValue}`;
    return new URL(normalizedValue).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function showDomainReport() {
  const hostname = getHostname(domainInput.value);
  if (!hostname) {
    domainInput.setCustomValidity(
      "Escribe un dominio válido, por ejemplo grumphya.com.",
    );
    domainInput.reportValidity();
    return;
  }

  domainInput.setCustomValidity("");
  const isGrumphya = hostname === "grumphya.com";
  grumphyaReport.hidden = !isGrumphya;
  simulatedReport.hidden = isGrumphya;

  document.querySelectorAll(".searched-domain").forEach((domainLabel) => {
    domainLabel.textContent = hostname;
  });

  (isGrumphya ? grumphyaReport : simulatedReport).scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}

domainSubmit.addEventListener("click", showDomainReport);
domainInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") showDomainReport();
});

domainInput.addEventListener("input", () => domainInput.setCustomValidity(""));

const contactSection = document.querySelector("#prototype-contact-form");
const contactResult = document.querySelector("#contact-result");

document.querySelector("#contact-submit").addEventListener("click", () => {
  const requiredFields = contactSection.querySelectorAll("[required]");
  const isComplete = [...requiredFields].every((field) =>
    field.reportValidity(),
  );
  if (!isComplete) return;

  contactResult.hidden = false;
  contactResult.focus();
});
