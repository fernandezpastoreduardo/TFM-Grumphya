import { useCallback, useEffect, useRef, useState } from "react";
import { USER_AVATAR_UPDATED_EVENT } from "../../infrastructure/auth/session";
import type { AccountProfile, GoodIdea, PlanCode } from "./user-profile.models";
import {
  AVATAR_UPLOAD_ERROR,
  PLANS,
  PLAN_ALREADY_ACTIVE_ERROR,
  PROFILE_LOAD_ERROR,
  PURCHASE_ERROR,
  RANKING_PREFERENCE_ERROR,
  SESSION_REQUIRED_ERROR,
} from "./user-profile.constants";
import {
  loadUserProfile,
  purchaseUserPlan,
  updateUserRankingPreference,
  uploadUserAvatar,
} from "./user-profile.service";

export function useUserProfile() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [goodIdeas, setGoodIdeas] = useState<GoodIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [purchasingPlan, setPurchasingPlan] = useState<PlanCode | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PlanCode | null>(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [rankingPreferenceError, setRankingPreferenceError] = useState("");
  const [rankingPreferenceSaving, setRankingPreferenceSaving] = useState(false);
  const purchaseKeyRef = useRef<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await loadUserProfile();
      if (result.profile === null) {
        setLoadError(
          result.status === 401 ? SESSION_REQUIRED_ERROR : PROFILE_LOAD_ERROR,
        );
        return;
      }
      setProfile(result.profile);
      setGoodIdeas(result.goodIdeas);
    } catch {
      setLoadError(PROFILE_LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function purchasePlan(plan: PlanCode) {
    setPurchasingPlan(plan);
    setPurchaseError("");
    purchaseKeyRef.current ??= crypto.randomUUID();
    try {
      const result = await purchaseUserPlan(plan, purchaseKeyRef.current);
      if (result.profile === null) {
        setPurchaseError(
          result.status === 401
            ? SESSION_REQUIRED_ERROR
            : result.status === 409
              ? PLAN_ALREADY_ACTIVE_ERROR
              : PURCHASE_ERROR,
        );
        return;
      }
      const updatedPlan = result.profile.plans.find(
        (item) => item.plan === plan,
      );
      if (!updatedPlan || updatedPlan.status !== "active") {
        setPurchaseError(PURCHASE_ERROR);
        return;
      }
      purchaseKeyRef.current = null;
      setProfile(result.profile);
      setPaymentPlan(plan);
    } catch {
      setPurchaseError(PURCHASE_ERROR);
    } finally {
      setPurchasingPlan(null);
    }
  }

  function finishPurchaseSimulation() {
    setPaymentPlan(null);
    void loadProfile();
  }

  async function uploadAvatar(file: File): Promise<boolean> {
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const result = await uploadUserAvatar(file);
      if (result.avatarUrl === null) {
        setAvatarError(result.message ?? AVATAR_UPLOAD_ERROR);
        return false;
      }
      setProfile((current) =>
        current
          ? {
              ...current,
              user: { ...current.user, avatarUrl: result.avatarUrl },
            }
          : current,
      );
      window.dispatchEvent(
        new CustomEvent(USER_AVATAR_UPDATED_EVENT, {
          detail: result.avatarUrl,
        }),
      );
      return true;
    } catch {
      setAvatarError(AVATAR_UPLOAD_ERROR);
      return false;
    } finally {
      setAvatarUploading(false);
    }
  }

  async function updateRankingPreference(enabled: boolean) {
    setRankingPreferenceSaving(true);
    setRankingPreferenceError("");
    try {
      const result = await updateUserRankingPreference(enabled);
      if (result.profile === null) {
        setRankingPreferenceError(
          result.status === 401
            ? SESSION_REQUIRED_ERROR
            : RANKING_PREFERENCE_ERROR,
        );
        return;
      }
      setProfile(result.profile);
    } catch {
      setRankingPreferenceError(RANKING_PREFERENCE_ERROR);
    } finally {
      setRankingPreferenceSaving(false);
    }
  }

  return {
    profile,
    goodIdeas,
    loading,
    loadError,
    purchasingPlan,
    paymentPlan,
    purchaseError,
    avatarUploading,
    avatarError,
    avatarEditorOpen,
    rankingPreferenceError,
    rankingPreferenceSaving,
    plans: PLANS,
    loadProfile,
    purchasePlan,
    finishPurchaseSimulation,
    uploadAvatar,
    updateRankingPreference,
    setAvatarError,
    setAvatarEditorOpen,
  };
}
