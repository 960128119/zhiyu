type VideoRegenerationDirectiveInput = {
  draftTitle: string;
  draftId: string;
  videoPath: string;
  note?: string | null;
};

export function buildVideoRegenerationDirective(
  input: VideoRegenerationDirectiveInput,
) {
  const note = input.note?.trim();
  return [
    `主人要求重生成投研视频《${input.draftTitle}》。`,
    `原草稿ID：${input.draftId}`,
    `原视频路径：${input.videoPath}`,
    note ? `主人补充要求：${note}` : null,
    "请重新读取操盘交易员和自选股猎手的最新工作记录，重新整理脚本、分镜、旁白、字幕、画面和风险提示。",
    "必须优先调用 videoRenderInvestmentBrief 生成新的本地成片，拿到新的 localPath 后再调用 douyinCreatePublishDraft 创建新的抖音本地草稿。",
    "不要复用被要求重生成的旧视频文件；不要只记录状态，必须实际发起新一轮视频生产。",
  ]
    .filter(Boolean)
    .join("\n");
}
