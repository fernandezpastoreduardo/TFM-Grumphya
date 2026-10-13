import { AuthenticationPage } from "../features/authentication/authentication-page";
import { Contact } from "../features/contact/contact";
import { GoodPractices } from "../features/good-practices/good-practices";
import { NotableHumans } from "../features/notable-humans/notable-humans";
import { Pricing } from "../features/pricing/pricing";
import { PrivacyPolicy } from "../features/register-with-plan/privacy-policy";
import { RegisterWithPlan } from "../features/register-with-plan/register-with-plan";
import { RegistrationVerification } from "../features/register-with-plan/registration-verification";
import { Roast } from "../features/roast/roast";
import { WorstIdeas } from "../features/worst-ideas/worst-ideas";
import {
  SectionPageFrame,
  type SectionPageMeta,
} from "../shared/components/section-page-frame";

const PAGE_META: Record<string, SectionPageMeta> = {
  "/lo-peor-de-lo-peor": {
    label: "Ranking semanal · ideas rechazadas",
    title: "El cementerio de las ideas",
    intro:
      "Una pequeña clasificación de ocurrencias que se han ganado una pausa y una conversación seria.",
    theme: "rose",
  },
  "/descargate": {
    label: "Tres envíos gratis por sesión",
    title: "Descárgate a gusto",
    intro:
      "Suelta el insulto. Yo pongo la cara de haber leído cosas peores. Probablemente.",
    theme: "blue",
    mascot: "pointing",
  },
  "/humanos-notables": {
    label: "Clasificación de ideas aprobadas",
    title: "Humanos notables",
    intro:
      "Un aplauso para quien ha traído una idea con algo más que optimismo y una presentación bonita.",
    theme: "mint",
  },
  "/buenas-practicas": {
    label: "Una pausa para pensar",
    title: "Primero el problema. Luego el código.",
    intro:
      "Validar una necesidad antes de construir ayuda a cuidar el tiempo, el presupuesto y la energía del equipo.",
    theme: "calm",
    mascot: "pointing",
  },
  "/precios": {
    label: "Planes sencillos · contratación simulada",
    title: "Once usos. Sí, once.",
    intro:
      "Elige qué quieres poner a prueba. La compra todavía es una simulación: aquí no se mueve dinero.",
    theme: "blue",
  },
  "/contacto": {
    label: "Contacto",
    title: "¿Necesitas decirlo en voz alta?",
    intro:
      "El formulario existe. Mi interés por recibirlo está en fase de evaluación.",
    theme: "rose",
  },
  "/login": {
    label: "Tu cuenta",
    title: "Ah, has vuelto.",
    intro:
      "Entra para consultar tu historial y el estado real de tu plan. La nostalgia es opcional.",
    theme: "mint",
  },
  "/crear-cuenta": {
    label: "Crear cuenta · plan seleccionado en el servidor",
    title: "Una cuenta. Un plan. Sin letra pequeña de película.",
    intro:
      "La contratación de esta versión es simulada. No introduzcas datos bancarios porque no hacen falta.",
    theme: "blue",
  },
  "/verificar-cuenta": {
    label: "Verificación de correo",
    title: "Una última comprobación",
    intro: "Validamos el enlace. Después decidirás si confirmas la contratación simulada.",
    theme: "mint",
  },
  "/politica-de-privacidad": {
    label: "Información provisional",
    title: "Política de privacidad",
    intro: "La información de privacidad se completará antes de abrir el registro al público.",
    theme: "calm",
  },
};

function SectionContent({ path }: { path: string }) {
  if (path === "/lo-peor-de-lo-peor") return <WorstIdeas />;
  if (path === "/descargate") return <Roast />;
  if (path === "/humanos-notables") return <NotableHumans />;
  if (path === "/buenas-practicas") return <GoodPractices />;
  if (path === "/precios") return <Pricing />;
  if (path === "/contacto") return <Contact />;
  if (path === "/crear-cuenta") return <RegisterWithPlan />;
  if (path === "/verificar-cuenta") return <RegistrationVerification />;
  if (path === "/politica-de-privacidad") return <PrivacyPolicy />;
  return <AuthenticationPage />;
}

export function SectionPage({ path }: { path: string }) {
  const page = PAGE_META[path] ?? PAGE_META["/buenas-practicas"];
  return (
    <SectionPageFrame page={page}>
      <SectionContent path={path} />
    </SectionPageFrame>
  );
}
