// scripts/api.js
export const TokenAnimatorAPI = {
  /** Retorna todas as animações salvas no token (array). */
  getAnimations(token) {
    return token?.document?.getFlag("token-animator", "anims") ?? [];
  },

  /** Salva o array completo de animações no token. */
  async setAnimations(token, anims) {
    return token.document.setFlag("token-animator", "anims", anims);
  },

  /** Executa uma animação por nome (atalho para a api de runtime). */
  async playByName(token, name, opts = {}) {
    const api = game.modules.get("token-animator")?.api;
    if (!api) return ui.notifications.error("API do Token Animator indisponível.");
    return api.playByName(token, name, opts);
  }
};
