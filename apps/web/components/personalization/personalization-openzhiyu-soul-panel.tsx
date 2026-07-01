"use client";

import { PersonalizationSwrBoundary } from "./personalization-swr-boundary";
import { PersonalizationBasicSettings } from "./personalization-basic-settings";

/**
 * Full-page openzhiyu Soul settings (formerly the personalization dialog "basic" tab).
 */
export function PersonalizationopenzhiyuSoulPanel() {
  return (
    <PersonalizationSwrBoundary>
      <PersonalizationBasicSettings open />
    </PersonalizationSwrBoundary>
  );
}
