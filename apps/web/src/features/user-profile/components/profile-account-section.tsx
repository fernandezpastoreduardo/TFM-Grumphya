import type { AccountProfile } from "../user-profile.models";
import { formatDate } from "../user-profile.formatters";

type ProfileAccountSectionProps = {
  profile: AccountProfile;
  rankingPreferenceSaving: boolean;
  rankingPreferenceError: string;
  onEditAvatar: () => void;
  onUpdateRankingPreference: (enabled: boolean) => void;
};

export function ProfileAccountSection({
  profile,
  rankingPreferenceSaving,
  rankingPreferenceError,
  onEditAvatar,
  onUpdateRankingPreference,
}: ProfileAccountSectionProps) {
  return (
    <section
      className="profile-account-card"
      aria-labelledby="profile-account-title"
    >
      <div className="profile-account-heading">
        <div>
          <span className="eyebrow">Tus datos</span>
          <h2 id="profile-account-title">{profile.user.username}</h2>
        </div>
        <div className="profile-avatar-edit">
          {profile.user.avatarUrl ? (
            <img
              className="profile-avatar"
              src={profile.user.avatarUrl}
              alt={`Avatar de ${profile.user.username}`}
            />
          ) : (
            <span className="profile-avatar" aria-hidden="true">
              {profile.user.username.slice(0, 1).toUpperCase()}
            </span>
          )}
          <button
            className="profile-avatar-edit-button"
            type="button"
            aria-label="Editar avatar"
            onClick={onEditAvatar}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m14.7 6.3 3 3M4 20l4.2-.9L19 7.3a2.1 2.1 0 0 0-3-3L5.2 15.1 4 20Z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="profile-avatar-control">
        <small>
          Un retrato redondo que aparecerá junto a tu nombre en perfil y
          rankings.
        </small>
      </div>
      <dl className="profile-details">
        <div>
          <dt>Correo electrónico</dt>
          <dd>{profile.user.email}</dd>
        </div>
        <div>
          <dt>En Grumphya desde</dt>
          <dd>{formatDate(profile.user.createdAt) ?? "fecha no disponible"}</dd>
        </div>
      </dl>
      <div className="profile-ranking-consent">
        <label>
          <input
            type="checkbox"
            checked={profile.user.publicRankingsOptIn}
            disabled={rankingPreferenceSaving}
            onChange={(event) =>
              void onUpdateRankingPreference(event.currentTarget.checked)
            }
          />
          Quiero aparecer en los rankings públicos con mi alias, mis cantidades
          y, si he elegido uno, mi avatar.
        </label>
        <p>
          Es opcional. Puedes retirar esta autorización aquí cuando quieras.
        </p>
        {rankingPreferenceError ? (
          <p role="alert">{rankingPreferenceError}</p>
        ) : null}
        {rankingPreferenceSaving ? (
          <p role="status">Guardando tu preferencia…</p>
        ) : null}
      </div>
      {!profile.user.emailVerified ? (
        <p className="profile-verification-notice" role="status">
          <strong>Correo sin verificar.</strong> Tu cuenta y tus planes activos
          siguen disponibles.
        </p>
      ) : null}
    </section>
  );
}
