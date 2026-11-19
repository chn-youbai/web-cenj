import { getStorageItem, setStorageItem } from "@/core/storage";
import { showToast } from "@/core/toast";

const RANDOM_NICKNAMES = [
  "星际漫游者",
  "吃瓜同学",
  "夜猫子探险家",
  "代码修仙者",
  "银河系搭车客",
  "潜水员小明",
  "追光少年",
  "快乐干饭人",
  "月球背面旅人",
  "神秘课代表",
  "极客老司机",
  "喵星守望者",
  "时空旅人",
  "宇宙观测员",
  "摸鱼艺术家",
  "像素造梦师",
  "赛博朋克猫",
  "数字游民",
  "海岛微风",
  "晨曦之星",
];

const RANDOM_AVATARS = [
  "🚀",
  "🍉",
  "🐱",
  "👾",
  "🌟",
  "🍕",
  "🦊",
  "☕",
  "🎮",
  "🌈",
  "🔥",
  "🪐",
  "🎵",
  "🦄",
  "🍦",
  "🛸",
];

const STORAGE_KEY_NICKNAME = "guestbook_nickname";
const STORAGE_KEY_AVATAR = "guestbook_avatar";

export interface BoardIdentity {
  nickname: string;
  avatar: string;
}

const currentIdentity: BoardIdentity = {
  nickname: "",
  avatar: "🚀",
};

export function getRandomNickname(): string {
  const randIdx = Math.floor(Math.random() * RANDOM_NICKNAMES.length);
  const randSuffix = Math.floor(Math.random() * 90 + 10);
  return `${RANDOM_NICKNAMES[randIdx] ?? "星际漫游者"}#${randSuffix}`;
}

export function getRandomAvatar(): string {
  return RANDOM_AVATARS[Math.floor(Math.random() * RANDOM_AVATARS.length)] ?? "🚀";
}

export function initUserIdentity(): void {
  const savedNick = getStorageItem(STORAGE_KEY_NICKNAME);
  const savedAvatar = getStorageItem(STORAGE_KEY_AVATAR);

  currentIdentity.nickname = savedNick || getRandomNickname();
  currentIdentity.avatar = savedAvatar || getRandomAvatar();

  const nickInput = document.getElementById("nicknameInput") as HTMLInputElement | null;
  const avatarBadge = document.getElementById("avatarBadge");
  if (nickInput) nickInput.value = currentIdentity.nickname;
  if (avatarBadge) avatarBadge.textContent = currentIdentity.avatar;
}

export function saveUserIdentity(): void {
  const nickInput = document.getElementById("nicknameInput") as HTMLInputElement | null;
  const trimmed = nickInput?.value.trim() || "";
  if (trimmed) {
    currentIdentity.nickname = trimmed;
    setStorageItem(STORAGE_KEY_NICKNAME, currentIdentity.nickname);
  }
  setStorageItem(STORAGE_KEY_AVATAR, currentIdentity.avatar);
}

export function changeRandomIdentity(): void {
  currentIdentity.nickname = getRandomNickname();
  currentIdentity.avatar = getRandomAvatar();
  const nickInput = document.getElementById("nicknameInput") as HTMLInputElement | null;
  const avatarBadge = document.getElementById("avatarBadge");
  if (nickInput) nickInput.value = currentIdentity.nickname;
  if (avatarBadge) avatarBadge.textContent = currentIdentity.avatar;
  saveUserIdentity();
  showToast("🎲 已为您更换新昵称与头像！");
}

export function cycleRandomAvatar(): void {
  currentIdentity.avatar = getRandomAvatar();
  const avatarBadge = document.getElementById("avatarBadge");
  if (avatarBadge) avatarBadge.textContent = currentIdentity.avatar;
  saveUserIdentity();
}

export function getCurrentIdentity(): BoardIdentity {
  return { ...currentIdentity };
}
