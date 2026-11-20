export interface AlmanacYiJi {
  yi: string;
  yiDesc: string;
  ji: string;
  jiDesc: string;
}

export interface AlmanacDayData {
  yearText: string;
  monthText: string;
  dayNumber: string;
  weekdayText: string;
  lunarText: string;
  greeting: string;
  yiji: AlmanacYiJi;
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

const YI_JI_LIST: readonly AlmanacYiJi[] = [
  {
    yi: "散步看云",
    yiDesc: "把步子放慢，抬头看看天色",
    ji: "熬夜内耗",
    jiDesc: "把今天没想通的事留给明天",
  },
  {
    yi: "整理桌面",
    yiDesc: "留出一块干净的呼吸空间",
    ji: "勉强自己",
    jiDesc: "不合时宜的聚会可以婉拒",
  },
  {
    yi: "认真吃饭",
    yiDesc: "好好挑一顿合胃口的热饭",
    ji: "匆忙赶路",
    jiDesc: "慢两分钟往往不会迟到",
  },
  {
    yi: "读几页书",
    yiDesc: "在纸页里借一点安静的定力",
    ji: "反复刷新",
    jiDesc: "别让碎片消息牵着节奏走",
  },
  {
    yi: "晒晒太阳",
    yiDesc: "哪怕十分钟也足够回血",
    ji: "自我怀疑",
    jiDesc: "你比自己以为的更稳当",
  },
  {
    yi: "给朋友发消息",
    yiDesc: "想念谁就自然地问候一句",
    ji: "口是心非",
    jiDesc: "坦诚表达往往更省力",
  },
  {
    yi: "听一张老专辑",
    yiDesc: "让熟悉的旋律陪一会儿",
    ji: "过度计划",
    jiDesc: "保留一点随性的余地",
  },
  {
    yi: "早睡半小时",
    yiDesc: "把夜晚还给真正的休息",
    ji: "空想焦虑",
    jiDesc: "手头做一件小事就会踏实",
  },
  {
    yi: "喝杯热饮",
    yiDesc: "手心暖了，心也就跟着定下来",
    ji: "急于求成",
    jiDesc: "很多事情需要一点发酵时间",
  },
  {
    yi: "随手记下灵感",
    yiDesc: "好念头如果不记下来很快会溜走",
    ji: "翻旧账",
    jiDesc: "往前看通常更有意思",
  },
  {
    yi: "开窗通风",
    yiDesc: "换一屋子新鲜流动的空气",
    ji: "久坐不动",
    jiDesc: "每隔一小时站起来伸个懒腰",
  },
  {
    yi: "做件无用但开心的小事",
    yiDesc: "快乐不需要时刻证明意义",
    ji: "讨好别人",
    jiDesc: "先照顾好自己的真实感受",
  },
  {
    yi: "看一场落日",
    yiDesc: "傍晚的光线总是格外温柔",
    ji: "带情绪睡去",
    jiDesc: "睡前把心事轻轻放一放",
  },
  {
    yi: "收拾旧物",
    yiDesc: "留住真正用得上、喜欢的",
    ji: "盲目攀比",
    jiDesc: "每个人都有自己的时区",
  },
  {
    yi: "独自发会儿呆",
    yiDesc: "大脑也需要一段留白时间",
    ji: "同时做太多事",
    jiDesc: "一次只做好眼前这一件",
  },
  {
    yi: "记录一件小确幸",
    yiDesc: "微小的开心值得被郑重记住",
    ji: "苛责细节",
    jiDesc: "差不多先生有时候很快乐",
  },
];

export function getApproxSunTimes(
  date = new Date(),
  latDeg = 30,
): { sunrise: number; sunset: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const decl = 0.4093 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (latDeg * Math.PI) / 180;
  const cosH = Math.max(-0.99, Math.min(0.99, -Math.tan(latRad) * Math.tan(decl)));
  const halfDayHours = (Math.acos(cosH) * 180) / Math.PI / 15;
  return {
    sunrise: 12 - halfDayHours,
    sunset: 12 + halfDayHours,
  };
}

export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours() + date.getMinutes() / 60;
  const { sunrise, sunset } = getApproxSunTimes(date);

  if (hour >= sunrise && hour < 8) return "早安";
  if (hour >= 8 && hour < 12) return "早上好";
  if (hour >= 12 && hour < 14) return "中午好";
  if (hour >= 14 && hour < sunset) return "下午好";
  if (hour >= sunset && hour < 22) return "晚上好";
  return "晚安";
}

export function getDateSeed(date = new Date()): number {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function formatChineseLunar(date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    });
    const parts = fmt.formatToParts(date);
    const monthPart = parts.find((p) => p.type === "month")?.value ?? "";
    const dayPart = parts.find((p) => p.type === "day")?.value ?? "";
    if (monthPart && dayPart) {
      return `农历${monthPart}${dayPart}`;
    }
    return fmt.format(date);
  } catch {
    return "农历";
  }
}

export function buildAlmanacDay(date = new Date()): AlmanacDayData {
  const seed = getDateSeed(date);
  const yiji = YI_JI_LIST[seed % YI_JI_LIST.length] ?? YI_JI_LIST[0];
  const monthNames = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ];

  return {
    yearText: `${date.getFullYear()}`,
    monthText: monthNames[date.getMonth()] ?? `${date.getMonth() + 1}月`,
    dayNumber: String(date.getDate()).padStart(2, "0"),
    weekdayText: WEEKDAYS[date.getDay()] ?? "",
    lunarText: formatChineseLunar(date),
    greeting: getTimeGreeting(date),
    yiji: yiji as AlmanacYiJi,
  };
}

export function initAlmanacPage(): void {
  const data = buildAlmanacDay(new Date());
  const setText = (id: string, value: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("almanacGreeting", data.greeting);
  setText("almanacYearMonth", `${data.yearText} · ${data.monthText}`);
  setText("almanacLunar", data.lunarText);
  setText("almanacDayNum", data.dayNumber);
  setText("almanacWeekday", data.weekdayText);
  setText("almanacYiTitle", data.yiji.yi);
  setText("almanacYiDesc", data.yiji.yiDesc);
  setText("almanacJiTitle", data.yiji.ji);
  setText("almanacJiDesc", data.yiji.jiDesc);
}
