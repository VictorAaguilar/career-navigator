export function StartStage({ onStart }: { onStart: () => void }) {
  return (
    <div className="demo-section">
      <div className="intro-band">
        <div>
          <h3>Demo local de adaptación revisable</h3>
          <p>
            Pega un currículum y una oferta, revisa requisitos, decide cada propuesta y descarga
            un DOCX. Todo sucede en memoria durante esta sesión.
          </p>
          <p>
            Versión candidata pública de prueba: utiliza datos ficticios para evaluarla. Los
            archivos se procesan localmente en el navegador y no existe persistencia.
          </p>
        </div>
        <button type="button" className="primary-action" onClick={onStart}>
          Comenzar
        </button>
      </div>
      <div className="feature-grid" aria-label="Alcance de la demo">
        <Feature title="Qué hace" text="Conecta contratos reales de matching, scoring, propuestas, revisión, aplicación y exportación." />
        <Feature title="Qué no hace" text="No usa IA generativa, servicios externos, almacenamiento, cuentas, analytics ni carga de archivos." />
        <Feature title="Privacidad" text="Tus datos no se almacenan en esta versión y no salen del navegador." />
        <Feature title="Anti-invención" text="Las propuestas solo reordenan o conservan texto ya presente en el currículum." />
      </div>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="feature-item">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
