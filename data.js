(function () {
  'use strict';

  const ATTRS = [
    ['threePT', '三分', '远距离投射'],
    ['MID', '中投', '中距离终结'],
    ['FIN', '终结', '篮下手感'],
    ['DNK', '扣篮', '冲击篮筐'],
    ['HAN', '控球', '持球创造'],
    ['PAS', '传球', '组织与视野'],
    ['PDEF', '外防', '外线防守'],
    ['IDEF', '内防', '禁区防守'],
    ['BLK', '盖帽', '护筐能力'],
    ['REB', '篮板', '篮板争抢'],
    ['ATH', '运动', '速度与爆发'],
    ['STR', '力量', '身体对抗'],
    ['CLU', '关键', '关键球表现'],
    ['POT', '潜力', '年轻阶段触发能力提升的概率']
  ];

  const TEAMS = [
    ['ATL', '亚特兰大老鹰', 'EAST', '#e03a3e', '#c1d32f'],
    ['BOS', '波士顿凯尔特人', 'EAST', '#007a33', '#ba9653'],
    ['BKN', '布鲁克林篮网', 'EAST', '#111111', '#b7b7b7'],
    ['CHA', '夏洛特黄蜂', 'EAST', '#1d1160', '#00788c'],
    ['CHI', '芝加哥公牛', 'EAST', '#ce1141', '#111111'],
    ['CLE', '克利夫兰骑士', 'EAST', '#860038', '#fdbb30'],
    ['DAL', '达拉斯独行侠', 'WEST', '#00538c', '#b8c4ca'],
    ['DEN', '丹佛掘金', 'WEST', '#0e2240', '#fec524'],
    ['DET', '底特律活塞', 'EAST', '#c8102e', '#1d42ba'],
    ['GSW', '金州勇士', 'WEST', '#1d428a', '#ffc72c'],
    ['HOU', '休斯敦火箭', 'WEST', '#ce1141', '#c4ced4'],
    ['IND', '印第安纳步行者', 'EAST', '#002d62', '#fdbb30'],
    ['LAC', '洛杉矶快船', 'WEST', '#c8102e', '#1d428a'],
    ['LAL', '洛杉矶湖人', 'WEST', '#552583', '#fdb927'],
    ['MEM', '孟菲斯灰熊', 'WEST', '#5d76a9', '#12173f'],
    ['MIA', '迈阿密热火', 'EAST', '#98002e', '#f9a01b'],
    ['MIL', '密尔沃基雄鹿', 'EAST', '#00471b', '#eee1c6'],
    ['MIN', '明尼苏达森林狼', 'WEST', '#0c2340', '#78be20'],
    ['NOP', '新奥尔良鹈鹕', 'WEST', '#0c2340', '#c8102e'],
    ['NYK', '纽约尼克斯', 'EAST', '#006bb6', '#f58426'],
    ['OKC', '俄克拉荷马雷霆', 'WEST', '#007ac1', '#ef3b24'],
    ['ORL', '奥兰多魔术', 'EAST', '#0077c0', '#c4ced4'],
    ['PHI', '费城76人', 'EAST', '#006bb6', '#ed174c'],
    ['PHX', '菲尼克斯太阳', 'WEST', '#1d1160', '#e56020'],
    ['POR', '波特兰开拓者', 'WEST', '#e03a3e', '#111111'],
    ['SAC', '萨克拉门托国王', 'WEST', '#5a2d81', '#63727a'],
    ['SAS', '圣安东尼奥马刺', 'WEST', '#111111', '#c4ced4'],
    ['TOR', '多伦多猛龙', 'EAST', '#ce1141', '#111111'],
    ['UTA', '犹他爵士', 'WEST', '#002b5c', '#f9a01b'],
    ['WAS', '华盛顿奇才', 'EAST', '#002b5c', '#e31837']
  ].map(([id, name, conference, primary, secondary]) => ({
    id,
    name,
    conference,
    primary,
    secondary,
    logo: `https://a.espncdn.com/i/teamlogos/nba/500/${id.toLowerCase()}.png`
  }));

  const ARCHETYPES = {
    sniper:   { label: '空间狙击手', category: '投射', values: [96, 88, 72, 58, 84, 79, 69, 48, 42, 54, 79, 57, 91] },
    creator:  { label: '持球发动机', category: '组织', values: [87, 88, 84, 71, 96, 94, 72, 48, 38, 49, 90, 61, 92] },
    slasher:  { label: '暴力突破手', category: '终结', values: [77, 81, 94, 96, 88, 74, 77, 61, 59, 70, 96, 84, 88] },
    wing:     { label: '攻防一体锋线', category: '全能', values: [86, 88, 90, 88, 85, 81, 91, 79, 73, 78, 89, 83, 92] },
    anchor:   { label: '禁区守护者', category: '防守', values: [61, 72, 84, 88, 55, 69, 66, 95, 97, 94, 76, 94, 84] },
    big:      { label: '低位巨兽', category: '内线', values: [70, 82, 95, 91, 69, 81, 61, 89, 86, 96, 72, 97, 89] },
    twoway:   { label: '双向尖兵', category: '防守', values: [82, 81, 82, 78, 80, 77, 95, 75, 69, 73, 91, 82, 86] },
    pointbig: { label: '全能策应中锋', category: '组织', values: [83, 92, 96, 82, 84, 97, 75, 91, 85, 98, 75, 97, 96] }
  };

  const ROSTER_SEEDS = {
    ATL: [['特雷·杨', 'PG', 'creator', 90], ['杰伦·约翰逊', 'PF', 'wing', 86], ['戴森·丹尼尔斯', 'SG', 'twoway', 84]],
    BOS: [['杰森·塔图姆', 'SF', 'wing', 94], ['杰伦·布朗', 'SG', 'wing', 91], ['德里克·怀特', 'PG', 'twoway', 86]],
    BKN: [['迈克尔·波特', 'SF', 'sniper', 85], ['卡姆·托马斯', 'SG', 'creator', 83], ['尼古拉斯·克拉克斯顿', 'C', 'anchor', 82]],
    CHA: [['拉梅洛·鲍尔', 'PG', 'creator', 88], ['布兰登·米勒', 'SF', 'sniper', 85], ['迈尔斯·布里奇斯', 'PF', 'slasher', 82]],
    CHI: [['约什·吉迪', 'PG', 'creator', 85], ['科比·怀特', 'SG', 'sniper', 84], ['尼古拉·武切维奇', 'C', 'big', 84]],
    CLE: [['多诺万·米切尔', 'SG', 'creator', 93], ['达里厄斯·加兰', 'PG', 'creator', 88], ['埃文·莫布里', 'PF', 'anchor', 90]],
    DAL: [['库珀·弗拉格', 'SF', 'wing', 86], ['凯里·欧文', 'PG', 'creator', 92], ['安东尼·戴维斯', 'PF', 'anchor', 94]],
    DEN: [['尼古拉·约基奇', 'C', 'pointbig', 98], ['贾马尔·穆雷', 'PG', 'creator', 89], ['阿隆·戈登', 'PF', 'slasher', 85]],
    DET: [['凯德·坎宁安', 'PG', 'creator', 92], ['杰伦·杜伦', 'C', 'big', 84], ['奥萨尔·汤普森', 'SF', 'twoway', 83]],
    GSW: [['斯蒂芬·库里', 'PG', 'sniper', 96], ['吉米·巴特勒', 'SF', 'wing', 90], ['德雷蒙德·格林', 'PF', 'twoway', 84]],
    HOU: [['凯文·杜兰特', 'SF', 'sniper', 95], ['阿尔佩伦·申京', 'C', 'pointbig', 89], ['阿门·汤普森', 'PG', 'twoway', 88]],
    IND: [['泰瑞斯·哈利伯顿', 'PG', 'creator', 92], ['帕斯卡尔·西亚卡姆', 'PF', 'wing', 88], ['本尼迪克特·马瑟林', 'SG', 'slasher', 83]],
    LAC: [['科怀·伦纳德', 'SF', 'wing', 94], ['詹姆斯·哈登', 'PG', 'creator', 91], ['伊维察·祖巴茨', 'C', 'anchor', 85]],
    LAL: [['卢卡·东契奇', 'PG', 'creator', 97], ['勒布朗·詹姆斯', 'SF', 'wing', 94], ['奥斯汀·里夫斯', 'SG', 'creator', 87]],
    MEM: [['贾·莫兰特', 'PG', 'slasher', 91], ['小贾伦·杰克逊', 'PF', 'anchor', 89], ['扎克·伊迪', 'C', 'big', 82]],
    MIA: [['泰勒·希罗', 'SG', 'sniper', 87], ['巴姆·阿德巴约', 'C', 'anchor', 89], ['安德鲁·威金斯', 'SF', 'wing', 84]],
    MIL: [['扬尼斯·阿德托昆博', 'PF', 'slasher', 97], ['迈尔斯·特纳', 'C', 'anchor', 86], ['凯尔·库兹马', 'PF', 'wing', 82]],
    MIN: [['安东尼·爱德华兹', 'SG', 'slasher', 95], ['鲁迪·戈贝尔', 'C', 'anchor', 88], ['朱利叶斯·兰德尔', 'PF', 'big', 87]],
    NOP: [['锡安·威廉森', 'PF', 'slasher', 91], ['德章泰·穆雷', 'PG', 'creator', 86], ['特雷·墨菲', 'SF', 'sniper', 85]],
    NYK: [['杰伦·布伦森', 'PG', 'creator', 94], ['卡尔·安东尼·唐斯', 'C', 'pointbig', 93], ['米卡尔·布里奇斯', 'SF', 'twoway', 87]],
    OKC: [['谢伊·吉尔杰斯-亚历山大', 'PG', 'creator', 98], ['切特·霍姆格伦', 'C', 'anchor', 90], ['杰伦·威廉姆斯', 'SF', 'wing', 91]],
    ORL: [['保罗·班凯罗', 'PF', 'wing', 91], ['弗朗茨·瓦格纳', 'SF', 'wing', 89], ['戴斯蒙德·贝恩', 'SG', 'sniper', 87]],
    PHI: [['乔尔·恩比德', 'C', 'big', 95], ['泰瑞斯·马克西', 'PG', 'creator', 91], ['保罗·乔治', 'SF', 'wing', 87]],
    PHX: [['德文·布克', 'SG', 'sniper', 94], ['杰伦·格林', 'SG', 'slasher', 86], ['狄龙·布鲁克斯', 'SF', 'twoway', 84]],
    POR: [['德尼·阿夫迪亚', 'SF', 'wing', 86], ['斯库特·亨德森', 'PG', 'creator', 82], ['多诺万·克林根', 'C', 'anchor', 83]],
    SAC: [['多曼塔斯·萨博尼斯', 'C', 'pointbig', 91], ['扎克·拉文', 'SG', 'slasher', 88], ['德玛尔·德罗赞', 'SF', 'creator', 87]],
    SAS: [['维克托·文班亚马', 'C', 'anchor', 96], ['达龙·福克斯', 'PG', 'slasher', 91], ['斯蒂芬·卡斯尔', 'SG', 'twoway', 84]],
    TOR: [['斯科蒂·巴恩斯', 'SF', 'wing', 88], ['布兰登·英格拉姆', 'SF', 'creator', 87], ['伊曼纽尔·奎克利', 'PG', 'sniper', 84]],
    UTA: [['劳里·马尔卡宁', 'PF', 'sniper', 88], ['基扬特·乔治', 'PG', 'creator', 82], ['沃克·凯斯勒', 'C', 'anchor', 84]],
    WAS: [['亚历克斯·萨尔', 'C', 'anchor', 84], ['特雷·约翰逊', 'SG', 'sniper', 82], ['克里斯·米德尔顿', 'SF', 'creator', 83]]
  };

  const EXTRA_ROSTER_SEEDS = {
    ATL: [['扎卡里·里萨谢', 'SF', 'twoway', 82], ['奥涅卡·奥孔古', 'C', 'anchor', 83], ['卢克·肯纳德', 'SG', 'sniper', 79], ['维特·克雷伊奇', 'SG', 'twoway', 77], ['拉里·南斯', 'PF', 'big', 78]],
    BOS: [['佩顿·普里查德', 'PG', 'sniper', 84], ['萨姆·豪瑟', 'SF', 'sniper', 79], ['内米亚斯·科塔', 'C', 'anchor', 78], ['乔丹·沃尔什', 'SF', 'twoway', 75], ['泽维尔·蒂尔曼', 'PF', 'anchor', 77]],
    BKN: [['特雷·曼恩', 'PG', 'creator', 80], ['特伦斯·曼恩', 'SG', 'twoway', 79], ['戴隆·夏普', 'C', 'big', 78], ['诺阿·克洛尼', 'PF', 'anchor', 79], ['杰伦·威尔逊', 'SF', 'twoway', 77]],
    CHA: [['科林·塞克斯顿', 'SG', 'slasher', 83], ['格兰特·威廉姆斯', 'PF', 'twoway', 78], ['穆萨·迪亚巴特', 'C', 'anchor', 77], ['特雷·曼', 'PG', 'creator', 79], ['提贾尼·萨隆', 'PF', 'wing', 76]],
    CHI: [['马塔斯·布泽利斯', 'PF', 'wing', 82], ['阿约·多苏穆', 'SG', 'twoway', 81], ['帕特里克·威廉姆斯', 'PF', 'twoway', 78], ['凯文·赫尔特', 'SG', 'sniper', 79], ['扎克·科林斯', 'C', 'big', 78]],
    CLE: [['贾勒特·阿伦', 'C', 'anchor', 87], ['马克斯·斯特鲁斯', 'SF', 'sniper', 81], ['德安德烈·亨特', 'SF', 'wing', 84], ['迪安·韦德', 'PF', 'twoway', 78], ['萨姆·梅里尔', 'SG', 'sniper', 77]],
    DAL: [['克莱·汤普森', 'SG', 'sniper', 84], ['德里克·莱夫利', 'C', 'anchor', 84], ['丹尼尔·加福德', 'C', 'big', 83], ['PJ·华盛顿', 'PF', 'twoway', 84], ['纳吉·马绍尔', 'SF', 'wing', 80]],
    DEN: [['卡梅伦·约翰逊', 'SF', 'sniper', 85], ['克里斯蒂安·布劳恩', 'SG', 'twoway', 83], ['约纳斯·瓦兰丘纳斯', 'C', 'big', 82], ['小蒂姆·哈达威', 'SG', 'sniper', 79], ['佩顿·沃特森', 'SF', 'twoway', 78]],
    DET: [['托拜厄斯·哈里斯', 'PF', 'wing', 83], ['杰登·艾维', 'SG', 'slasher', 82], ['以赛亚·斯图尔特', 'C', 'anchor', 80], ['卡里斯·勒韦尔', 'SG', 'creator', 81], ['马利克·比斯利', 'SG', 'sniper', 82]],
    GSW: [['乔纳森·库明加', 'PF', 'slasher', 84], ['巴迪·希尔德', 'SG', 'sniper', 81], ['布兰丁·波杰姆斯基', 'SG', 'creator', 82], ['摩西·穆迪', 'SG', 'twoway', 80], ['特雷斯·杰克逊-戴维斯', 'C', 'anchor', 78]],
    HOU: [['弗雷德·范弗里特', 'PG', 'creator', 85], ['小贾巴里·史密斯', 'PF', 'twoway', 83], ['塔里·伊森', 'SF', 'twoway', 84], ['里德·谢泼德', 'PG', 'sniper', 81], ['史蒂文·亚当斯', 'C', 'big', 81]],
    IND: [['安德鲁·内姆哈德', 'PG', 'creator', 84], ['阿隆·内史密斯', 'SF', 'twoway', 82], ['奥比·托平', 'PF', 'slasher', 81], ['贾雷斯·沃克', 'PF', 'wing', 78], ['TJ·麦康奈尔', 'PG', 'creator', 82]],
    LAC: [['布拉德利·比尔', 'SG', 'creator', 86], ['博格丹·博格达诺维奇', 'SG', 'sniper', 82], ['约翰·科林斯', 'PF', 'big', 83], ['德里克·琼斯', 'SF', 'twoway', 80], ['克里斯·邓恩', 'PG', 'twoway', 79]],
    LAL: [['德安德烈·艾顿', 'C', 'big', 85], ['马库斯·斯马特', 'PG', 'twoway', 82], ['八村垒', 'PF', 'wing', 82], ['贾里德·范德比尔特', 'PF', 'twoway', 78], ['道尔顿·克内克特', 'SF', 'sniper', 79]],
    MEM: [['杰伦·威尔斯', 'SF', 'twoway', 80], ['布兰登·克拉克', 'PF', 'big', 80], ['桑蒂·阿尔达马', 'PF', 'sniper', 81], ['文斯·威廉姆斯', 'SF', 'twoway', 78], ['斯科蒂·皮蓬', 'PG', 'creator', 79]],
    MIA: [['特里·罗齐尔', 'PG', 'creator', 81], ['小海梅·哈克斯', 'SF', 'wing', 80], ['克莱尔·韦尔', 'C', 'anchor', 82], ['海伍德·海史密斯', 'SF', 'twoway', 77], ['诺曼·鲍威尔', 'SG', 'sniper', 85]],
    MIL: [['小凯文·波特', 'PG', 'creator', 81], ['加里·特伦特', 'SG', 'sniper', 81], ['博比·波蒂斯', 'PF', 'big', 83], ['AJ·格林', 'SG', 'sniper', 78], ['帕特·康诺顿', 'SG', 'twoway', 76]],
    MIN: [['杰登·麦克丹尼尔斯', 'SF', 'twoway', 85], ['丹特·迪文琴佐', 'SG', 'sniper', 83], ['纳兹·里德', 'C', 'sniper', 84], ['罗布·迪林厄姆', 'PG', 'creator', 79], ['特伦斯·香农', 'SF', 'slasher', 78]],
    NOP: [['乔丹·普尔', 'SG', 'creator', 84], ['赫伯特·琼斯', 'SF', 'twoway', 85], ['伊夫·米西', 'C', 'anchor', 81], ['乔丹·霍金斯', 'SG', 'sniper', 79], ['何塞·阿尔瓦拉多', 'PG', 'twoway', 79]],
    NYK: [['OG·阿奴诺比', 'SF', 'twoway', 88], ['约什·哈特', 'SF', 'wing', 85], ['米切尔·罗宾逊', 'C', 'anchor', 82], ['乔丹·克拉克森', 'SG', 'creator', 82], ['迈尔斯·麦克布赖德', 'PG', 'twoway', 80]],
    OKC: [['吕冈茨·多尔特', 'SF', 'twoway', 84], ['以赛亚·哈尔滕施泰因', 'C', 'anchor', 85], ['卡森·华莱士', 'PG', 'twoway', 82], ['亚历克斯·卡鲁索', 'SG', 'twoway', 84], ['以赛亚·乔', 'SG', 'sniper', 80]],
    ORL: [['杰伦·萨格斯', 'PG', 'twoway', 86], ['温德尔·卡特', 'C', 'big', 83], ['安东尼·布莱克', 'PG', 'twoway', 81], ['乔纳森·艾萨克', 'PF', 'anchor', 82], ['杰特·霍华德', 'SG', 'sniper', 77]],
    PHI: [['小凯利·乌布雷', 'SF', 'slasher', 82], ['贾里德·麦凯恩', 'SG', 'sniper', 82], ['昆廷·格莱姆斯', 'SG', 'twoway', 83], ['安德烈·德拉蒙德', 'C', 'big', 79], ['凯莱布·马丁', 'SF', 'twoway', 79]],
    PHX: [['马克·威廉姆斯', 'C', 'anchor', 83], ['格雷森·阿伦', 'SG', 'sniper', 82], ['罗伊斯·奥尼尔', 'SF', 'twoway', 80], ['瑞安·邓恩', 'SF', 'twoway', 79], ['科林·吉莱斯皮', 'PG', 'creator', 77]],
    POR: [['谢登·夏普', 'SG', 'slasher', 84], ['朱·霍勒迪', 'PG', 'twoway', 87], ['杰拉米·格兰特', 'PF', 'wing', 83], ['罗伯特·威廉姆斯', 'C', 'anchor', 81], ['图马尼·卡马拉', 'SF', 'twoway', 82]],
    SAC: [['马利克·蒙克', 'SG', 'creator', 84], ['基根·穆雷', 'PF', 'twoway', 83], ['丹尼斯·施罗德', 'PG', 'creator', 82], ['基恩·埃利斯', 'SG', 'twoway', 81], ['德文·卡特', 'PG', 'twoway', 78]],
    SAS: [['德文·瓦塞尔', 'SG', 'sniper', 85], ['哈里森·巴恩斯', 'SF', 'wing', 82], ['杰里米·索汉', 'PF', 'twoway', 81], ['凯尔登·约翰逊', 'SF', 'slasher', 82], ['朱利安·尚帕尼', 'SF', 'sniper', 78]],
    TOR: [['RJ·巴雷特', 'SF', 'slasher', 85], ['雅各布·珀尔特尔', 'C', 'anchor', 84], ['格雷迪·迪克', 'SG', 'sniper', 81], ['奥查伊·阿巴吉', 'SG', 'twoway', 78], ['乔纳森·莫格博', 'PF', 'big', 77]],
    UTA: [['以赛亚·科利尔', 'PG', 'creator', 79], ['凯尔·菲利波夫斯基', 'PF', 'pointbig', 80], ['泰勒·亨德里克斯', 'PF', 'anchor', 78], ['布莱斯·森萨博', 'SF', 'sniper', 78], ['沃尔特·克莱顿', 'PG', 'creator', 77]],
    WAS: [['巴布·卡林顿', 'PG', 'creator', 81], ['比拉尔·库利巴利', 'SF', 'twoway', 82], ['科里·基斯珀特', 'SF', 'sniper', 80], ['特里斯坦·武克切维奇', 'C', 'big', 77], ['凯肖恩·乔治', 'SF', 'wing', 79]]
  };

  const POSITION_WEIGHTS = {
    PG: [0.10, 0.07, 0.08, 0.04, 0.14, 0.14, 0.10, 0.03, 0.02, 0.03, 0.10, 0.05, 0.10, 0],
    SG: [0.13, 0.10, 0.10, 0.07, 0.11, 0.08, 0.11, 0.03, 0.03, 0.04, 0.09, 0.05, 0.06, 0],
    SF: [0.10, 0.09, 0.10, 0.08, 0.08, 0.07, 0.10, 0.07, 0.05, 0.07, 0.08, 0.06, 0.05, 0],
    PF: [0.07, 0.08, 0.10, 0.10, 0.05, 0.06, 0.07, 0.10, 0.09, 0.11, 0.07, 0.07, 0.03, 0],
    C:  [0.04, 0.07, 0.11, 0.10, 0.03, 0.07, 0.04, 0.13, 0.12, 0.14, 0.05, 0.07, 0.03, 0]
  };

  const POSITIONS = {
    PG: { name: '控球后卫', icon: '◎', desc: '掌控节奏，组织与控球权重最高' },
    SG: { name: '得分后卫', icon: '↗', desc: '外线火力，投射与单打最关键' },
    SF: { name: '小前锋', icon: '◆', desc: '攻守均衡，适应最广泛的属性' },
    PF: { name: '大前锋', icon: '▲', desc: '对抗终结，兼顾篮板与护筐' },
    C: { name: '中锋', icon: '■', desc: '镇守禁区，内防与篮板决定上限' }
  };

  function hashName(name) {
    let value = 0;
    for (let i = 0; i < name.length; i += 1) value = (value * 31 + name.charCodeAt(i)) >>> 0;
    return value;
  }

  const PLAYER_ATTRIBUTE_OVERRIDES = {
    '斯蒂芬-库里': { threePT: 99, MID: 94, HAN: 97, PAS: 91, CLU: 98, REB: 48, BLK: 40, STR: 55 },
    '斯蒂芬·库里': { threePT: 99, MID: 94, HAN: 97, PAS: 91, CLU: 98, REB: 48, BLK: 40, STR: 55 },
    '杨瀚森': { threePT: 66, MID: 72, FIN: 77, HAN: 61, PAS: 74, PDEF: 57, IDEF: 80, BLK: 82, REB: 84, ATH: 67, STR: 79, CLU: 68 }
  };

  function weightedRating(attrs, pos) {
    return ATTRS.reduce((sum, [key], index) => sum + (attrs[key] || 0) * POSITION_WEIGHTS[pos][index], 0);
  }

  function calibrateAttributes(attrs, pos, targetOVR, protectedKeys) {
    const adjustable = ATTRS.map(([key]) => key).filter(key => key !== 'POT' && !protectedKeys.has(key));
    for (let pass = 0; pass < 4; pass += 1) {
      const delta = targetOVR - weightedRating(attrs, pos);
      if (Math.abs(delta) < 0.45) break;
      const availableWeight = adjustable.reduce((sum, key) => {
        const index = ATTRS.findIndex(([attrKey]) => attrKey === key);
        const canMove = delta > 0 ? attrs[key] < 99 : attrs[key] > 40;
        return sum + (canMove ? POSITION_WEIGHTS[pos][index] : 0);
      }, 0);
      if (!availableWeight) break;
      adjustable.forEach(key => {
        const index = ATTRS.findIndex(([attrKey]) => attrKey === key);
        if (!POSITION_WEIGHTS[pos][index]) return;
        attrs[key] = Math.max(40, Math.min(99, Math.round(attrs[key] + delta / availableWeight)));
      });
    }
  }

  function createPlayer(teamId, seed) {
    const [name, pos, archetype, ovr, potential, age, rookieYear] = seed;
    const profile = ARCHETYPES[archetype];
    const hash = hashName(name);
    const overrides = PLAYER_ATTRIBUTE_OVERRIDES[name] || {};
    const specialtyIndexes = profile.values
      .map((value, index) => ({ value, index }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
      .map(item => item.index);
    const protectedKeys = new Set([...specialtyIndexes.map(index => ATTRS[index][0]), ...Object.keys(overrides)]);
    const attrs = {};
    ATTRS.forEach(([key], index) => {
      if (key === 'POT') {
        attrs[key] = Math.max(40, Math.min(99, potential ?? (62 + hash % 31)));
        return;
      }
      const jitter = ((hash >> (index % 16)) % 7) - 3;
      const specialtyFactor = specialtyIndexes.includes(index) ? 0.4 : (profile.values[index] <= 65 ? 0.72 : 0.58);
      attrs[key] = Math.max(40, Math.min(99, Math.round(profile.values[index] + (ovr - 88) * specialtyFactor + jitter)));
    });
    Object.assign(attrs, overrides);
    calibrateAttributes(attrs, pos, ovr, protectedKeys);
    return { name, pos, archetype, archetypeLabel: profile.label, ovr, teamId, age, rookieYear, ...attrs };
  }

  const ACTIVE_ROSTER_SEEDS = window.NBA_ROSTER_SEEDS || Object.fromEntries(
    TEAMS.map(team => [team.id, [...ROSTER_SEEDS[team.id], ...EXTRA_ROSTER_SEEDS[team.id]]])
  );

  const CURRENT_PLAYERS = Object.fromEntries(
    TEAMS.map(team => [team.id, ACTIVE_ROSTER_SEEDS[team.id]
      .slice()
      .sort((left, right) => right[3] - left[3])
      .slice(0, 15)
      .map(seed => createPlayer(team.id, seed))])
  );

  const CURRENT_ERA = {
    key: 'current',
    label: '现役模式',
    startYear: 2025,
    seasonLabel: '2025-26',
    teams: TEAMS
  };
  let activeEra = CURRENT_ERA;
  let activeTeams = TEAMS;
  let activePlayers = CURRENT_PLAYERS;

  function setEra(key = 'current') {
    const era = key === 'current' ? CURRENT_ERA : window.NBA_ERA_DATA?.eras?.[String(key)];
    if (!era) return false;
    activeEra = era;
    activeTeams = era.teams;
    activePlayers = key === 'current' ? CURRENT_PLAYERS : Object.fromEntries(
      era.teams.map(team => [team.id, (era.rosterSeeds[team.id] || []).map(seed => createPlayer(team.id, seed))])
    );
    window.GAME_DATA.TEAMS = activeTeams;
    window.GAME_DATA.PLAYERS = activePlayers;
    window.GAME_DATA.activeEra = activeEra;
    return true;
  }

  function getTeam(id) {
    return activeTeams.find(team => team.id === id);
  }

  function getEra(key = activeEra.key) {
    if (key === 'current') return CURRENT_ERA;
    return window.NBA_ERA_DATA?.eras?.[String(key)] || CURRENT_ERA;
  }

  function getDraftClass(year) {
    return window.NBA_ERA_DATA?.draftClasses?.[String(year)] || [];
  }

  function seasonLabel(year) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }

  function grade(value) {
    if (value >= 98) return { label: 'S', color: '#f15a37' };
    if (value >= 95) return { label: 'A+', color: '#ef6d32' };
    if (value >= 90) return { label: 'A', color: '#ef8732' };
    if (value >= 85) return { label: 'A-', color: '#d99d24' };
    if (value >= 80) return { label: 'B+', color: '#58a26f' };
    if (value >= 75) return { label: 'B', color: '#35956e' };
    if (value >= 70) return { label: 'B-', color: '#3f8c91' };
    if (value >= 60) return { label: 'C', color: '#4b86a8' };
    if (value >= 50) return { label: 'D', color: '#777f8a' };
    return { label: 'E', color: '#8a8780' };
  }

  window.GAME_DATA = {
    ATTRS,
    TEAMS,
    PLAYERS: activePlayers,
    ARCHETYPES,
    POSITIONS,
    POSITION_WEIGHTS,
    activeEra,
    setEra,
    getEra,
    getDraftClass,
    seasonLabel,
    getTeam,
    grade
  };
}());
