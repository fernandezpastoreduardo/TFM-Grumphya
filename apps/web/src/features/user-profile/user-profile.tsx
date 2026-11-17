import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { AvatarEditorDialog } from "./components/AvatarEditorDialog";
import { ProfileAccountSection } from "./components/profile-account-section";
import { ProfileIdeasSection } from "./components/profile-ideas-section";
import { ProfilePlansSection } from "./components/profile-plans-section";
import { PaymentSimulationDialog } from "../register-with-plan/components/PaymentSimulationDialog";
import { UserDelete } from "../user-delete/user-delete";
import {
  PROFILE_LOAD_ERROR,
  PLANS,
  SESSION_REQUIRED_ERROR,
} from "./user-profile.constants";
import { useUserProfile } from "./use-user-profile";
import "./user-profile.scss";

export function UserProfile() {
  const state = useUserProfile();

  if (state.loading) {
    return (
      <LoadingSkeleton
        label="Consultando tu cuenta"
        className="profile-loading-skeleton"
      >
        <div className="profile-account-card profile-account-skeleton">
          <div className="profile-account-heading">
            <div className="profile-skeleton-identity">
              <SkeletonBlock className="skeleton-profile-eyebrow" />
              <SkeletonBlock className="skeleton-profile-title" />
            </div>
            <SkeletonBlock className="skeleton-profile-avatar" />
          </div>
          <SkeletonBlock className="skeleton-profile-detail" />
          <SkeletonBlock className="skeleton-profile-detail short" />
          <div className="profile-skeleton-plans">
            <SkeletonBlock className="skeleton-profile-plan" />
            <SkeletonBlock className="skeleton-profile-plan" />
          </div>
        </div>
        <div className="profile-ideas-card profile-ideas-skeleton">
          <SkeletonBlock className="skeleton-profile-title" />
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonBlock className="skeleton-profile-idea" key={index} />
          ))}
        </div>
      </LoadingSkeleton>
    );
  }

  if (state.loadError || state.profile === null) {
    return (
      <section
        className="profile-error-card"
        aria-labelledby="profile-error-title"
      >
        <span className="eyebrow">Cuenta no disponible</span>
        <h2 id="profile-error-title">
          No puedo enseñar un perfil que no he podido consultar.
        </h2>
        <p role="alert">{state.loadError || PROFILE_LOAD_ERROR}</p>
        <div className="profile-error-actions">
          {state.loadError === SESSION_REQUIRED_ERROR ? (
            <a className="button-primary" href="/login">
              Entrar en mi cuenta
            </a>
          ) : null}
          <button
            className="button-secondary"
            type="button"
            onClick={() => void state.loadProfile()}
          >
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  const { profile } = state;
  return (
    <div className="profile-page">
      <ProfileAccountSection
        profile={profile}
        rankingPreferenceSaving={state.rankingPreferenceSaving}
        rankingPreferenceError={state.rankingPreferenceError}
        onEditAvatar={() => {
          state.setAvatarError("");
          state.setAvatarEditorOpen(true);
        }}
        onUpdateRankingPreference={(enabled) =>
          void state.updateRankingPreference(enabled)
        }
      />
      <ProfilePlansSection
        profile={profile}
        purchasingPlan={state.purchasingPlan}
        paymentPlan={state.paymentPlan}
        purchaseError={state.purchaseError}
        onPurchasePlan={(plan) => void state.purchasePlan(plan)}
      />
      <ProfileIdeasSection goodIdeas={state.goodIdeas} />
      <UserDelete />
      {state.avatarEditorOpen ? (
        <AvatarEditorDialog
          avatarUrl={profile.user.avatarUrl}
          username={profile.user.username}
          uploading={state.avatarUploading}
          uploadError={state.avatarError}
          onClose={() => state.setAvatarEditorOpen(false)}
          onUpload={state.uploadAvatar}
        />
      ) : null}
      <PaymentSimulationDialog
        open={state.paymentPlan !== null}
        heading={
          state.paymentPlan === null
            ? undefined
            : `Estoy activando tu plan ${PLANS[state.paymentPlan].name}.`
        }
        onComplete={state.finishPurchaseSimulation}
      />
    </div>
  );
}
