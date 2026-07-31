import type { WorkflowStage } from "../app/workflow-stages";

const PRIVACY_NOTES: Record<WorkflowStage["id"], string> = {
  start: "La sesión comienza sin guardar datos personales ni crear registros.",
  resume: "El CV permanecerá en memoria cuando se habilite la captura real.",
  job: "La oferta se tratará como texto privado y no se enviará a servicios externos sin permiso.",
  analysis: "El análisis futuro ocultará identificadores internos y mostrará resultados comprensibles.",
  requirements: "Las evidencias se mostrarán como fragmentos revisables, no como trazas técnicas completas.",
  proposals: "Las sugerencias no sustituirán el texto final sin revisión humana.",
  review: "Las decisiones serán explícitas y no se almacenarán en esta versión.",
  preview: "La vista previa usará solo cambios aprobados durante la sesión.",
  download: "El DOCX futuro se generará bajo demanda y no se guardará automáticamente.",
};

const NEXT_STEPS: Record<WorkflowStage["id"], string> = {
  start: "En los próximos incrementos esta pantalla abrirá una sesión guiada.",
  resume: "Más adelante aceptará texto de CV y, después del MVP, archivos DOCX o PDF.",
  job: "Después se conectará con contratos de oferta estructurada y validación.",
  analysis: "Se integrarán matching, scoring y resumen de compatibilidad.",
  requirements: "Se podrán revisar requisitos, estados y evidencias de soporte.",
  proposals: "Se presentarán mejoras candidatas basadas en evidencia.",
  review: "Se habilitarán acciones de aprobación, rechazo y edición controlada.",
  preview: "Se visualizará el ResumeExportModel de manera limpia.",
  download: "Se conectará el renderer DOCX y la descarga desde el navegador.",
};

type StagePlaceholderProps = {
  stage: WorkflowStage;
};

export function StagePlaceholder({ stage }: StagePlaceholderProps) {
  return (
    <div className="stage-placeholder">
      <p className="stage-kicker">{stage.shortLabel}</p>
      <h2 id="stage-title">{stage.title}</h2>
      <p className="stage-description">{stage.description}</p>
      <div className="placeholder-grid">
        <section className="placeholder-note" aria-labelledby={`${stage.id}-future-title`}>
          <h3 id={`${stage.id}-future-title`}>Qué se hará aquí</h3>
          <p>{NEXT_STEPS[stage.id]}</p>
        </section>
        <section className="placeholder-note" aria-labelledby={`${stage.id}-privacy-title`}>
          <h3 id={`${stage.id}-privacy-title`}>Privacidad</h3>
          <p>{PRIVACY_NOTES[stage.id]}</p>
        </section>
      </div>
    </div>
  );
}
