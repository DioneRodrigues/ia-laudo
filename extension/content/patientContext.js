(() => {
  const EV = globalThis.EdenVoice ||= {};
  const empty = () => ({ patientName: null, gender: null, age: null, examName: null, patientInfoRaw: null });
  const clean = (value) => value?.replace(/\s+/gu, " ").replace(/[\s,;]+$/u, "").trim() || null;

  EV.getPatientContext = (root = document) => {
    const result = empty();
    try {
      const patientBlock = root.querySelector("#patient-info-minimize-tabs-section");
      if (patientBlock) {
        const paragraphs = patientBlock.querySelectorAll("p");
        result.patientName = clean(paragraphs[0]?.textContent);
        const raw = clean(paragraphs[1]?.textContent);
        if (raw) {
          const match = raw.match(/^(Masculino|Feminino|Não binário)\s*,?\s*(\d+\s*(?:anos?|meses?))$/iu);
          if (match) {
            result.gender = match[1][0].toLocaleUpperCase("pt-BR") + match[1].slice(1).toLocaleLowerCase("pt-BR");
            result.age = match[2].replace(/\s+/gu, " ");
          } else result.patientInfoRaw = raw;
        }
      }
      result.examName = clean(root.querySelector('[data-testid="study-reason-trigger"] p')?.textContent
        ?? root.querySelector('[data-testid="study-reason-trigger"]')?.textContent);
    } catch (error) {
      EV.Logger?.warn("Não foi possível ler os dados do paciente/exame", error);
    }
    return result;
  };

  EV.isSamePatientContext = (a, b) => {
    const normalize = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR");
    return normalize(a?.patientName) === normalize(b?.patientName)
      && normalize(a?.examName) === normalize(b?.examName);
  };
})();
