import type { GoodIdea } from "../user-profile.models";
import { formatDate } from "../user-profile.formatters";

type ProfileIdeasSectionProps = {
  goodIdeas: GoodIdea[];
};

export function ProfileIdeasSection({ goodIdeas }: ProfileIdeasSectionProps) {
  return (
    <section
      className="profile-ideas-card"
      aria-labelledby="profile-ideas-title"
    >
      <div className="profile-section-heading">
        <div>
          <span className="eyebrow">Las que sobrevivieron al análisis</span>
          <h2 id="profile-ideas-title">Tus últimas ideas aprobadas</h2>
        </div>
        <span className="profile-ideas-count">
          {goodIdeas.length} {goodIdeas.length === 1 ? "idea" : "ideas"}
        </span>
      </div>
      {goodIdeas.length > 0 ? (
        <>
          <p className="profile-ideas-intro">
            Aquí tienes tus ideas aprobadas, con su título y fecha.
          </p>
          <div className="profile-table-wrap">
            <table className="profile-ideas-table">
              <caption className="sr-only">
                Últimas ideas aprobadas de la cuenta
              </caption>
              <thead>
                <tr>
                  <th scope="col">Idea</th>
                  <th scope="col">Fecha de aprobación</th>
                </tr>
              </thead>
              <tbody>
                {goodIdeas.map((idea) => (
                  <tr key={idea.id}>
                    <th scope="row">{idea.title}</th>
                    <td>
                      <time dateTime={idea.createdAt}>
                        {formatDate(idea.createdAt) ?? "fecha no disponible"}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="profile-ideas-intro">
          Todavía no tienes ideas aprobadas guardadas en tu perfil.
        </p>
      )}
    </section>
  );
}
