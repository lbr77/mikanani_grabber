// import readline from 'readline';
import logger from './logger';
import fs from 'fs';
// const rl = readline.createInterface({
    // input: process.stdin,
    // output: process.s?tdout
// })
//thx to https://github.com/EstrellaXD/Auto_Bangumi/blob/67f0b81458f801569d5282ee8f23b0846e0bc1f4/backend/src/module/parser/analyser/raw_parser.py
const episode_re = /\d+/;
const title_re = /(.*|\[.*])( -? \d+|\[\d+]|\[\d+.?[vV]\d]|第\d+[话話集]|\[第?\d+[话話集]]|\[\d+.?END]|[Ee][Pp]?\d+)(.*)/;
const reso_re = /1080|720|2160|4K/;
const source_re = /B-Global|[Bb]aha|[Bb]ilibili|AT-X|Web/
const sub_re = /[简繁日字幕]|CH|BIG5|GB/
const prefix_re = /[^\w\s\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff-]/;

const chinese_map = ["零","一","二","三","四","五","六","七","八","九","十"]
const number_map = ["0","1","2","3","4","5","6","7","8","9","10"];
export type bangumiTorrent = {
    name   : string;
    season : string;
    episode: string;
    sub    : string;//字幕类型(简繁E)
    dpi    : string;//清晰度
    source : string;//bilibili AT-X...
    group  : string;//字幕组
    torrent: string;//torrentUrl;
    dow    : string;//星期几
    cover  : string;//封面
    bgmId  : string;//mikanani.id
}
function process_prefix(title: string): string{//去除中文字符
    return title.replace(/【/g, "[").replace(/】/g, "]");
}
function getGroup(title: string):string {//字幕组！
    return title.split(/[\[\]]/)[1];
}
function prefixProcess(title:string,group:string):string{
    title = title.replace(new RegExp(`.${group}.`,'g'),'');
    const pTitle = title.replace(prefix_re,"/");
    let arg_group = pTitle.split("/");
    arg_group = arg_group.filter(item => item !== "");
    if(arg_group.length==1){
        arg_group = arg_group[0].split(" ");
    }
    for(let arg of arg_group){
        if(/(新番|月?番)/.test(arg)&&arg.length<=5){
            title = title = title.replace(new RegExp(`.${arg}.`,'g'),"");
        }else if (/港澳台地区/.test(arg)) {
            title = title.replace(new RegExp(`.${arg}.`, 'g'), '');
        }
    }
    return title;
}
function processSeason(season_info:string){
    chinese_map.forEach((val,idx)=>{
        season_info = season_info.replace(val,number_map[idx]);
    })
    let name_season = season_info;
    const season_re = /S\d{1,2}|Season \d{1,2}|[第].[季期]/;
    name_season = name_season.replace(/[\[\]]/," ");
    const seasons = name_season.match(season_re) || [];
    let name = name_season;
    let season_raw = "";
    let season: number | string = 1;
    if(seasons.length ==0) {
        return [name_season,"1","1"];
    }
    name = name.replace(new RegExp(season_re,'g'),"");
    for(let seasonIt of seasons) {
        season_raw = seasonIt;
        if(/(Season|S)/.test(seasonIt)){
            season = parseInt(seasonIt.replace(/(Season|S)/g,""));
        }
        else if(/(第 ).*[季期(部分)]|部分/.test(seasonIt)){
            const season_pro = seasonIt.replace(/第季期 ]/g,"");
            
        }
    }
    return [name,season_raw, `${season}`];
}

function find_tags(other: string){
    const elements = other.replace(/[\[\]()（）]/g," ").split(" ").filter(x => x!=="");
    let sub: string | null = null;
    let resolution: string | null = null;
    let source: string | null = null;
    for(let element of elements){
        if(sub_re.test(element)){
            sub = element;
        }
        else if(reso_re.test(element)){
            resolution = element;
        }
        else if(source_re.test(element)){
            source = element;
        }
    }
    if(sub){
        sub = sub.replace(/_MP4|_MKV/,"");
    }
    return  [sub,resolution,source];
}
function processSub(sub:string){//简繁E
    sub = sub.trim();
    sub = sub.replace("CHT","繁");
    sub = sub.replace("CHS","简");
    sub = sub.replace("内嵌","");
    sub = sub.replace("外挂","");
    sub = sub.replace("特字","");
    sub = sub.replace("双语","");
    sub = sub.replace("日","");
    sub = sub.replace("体","");
    sub = sub.replace("字幕社招人内详","");
    sub = sub.replace("中","");
    sub = sub.replace("_","");
    sub = sub.replace("内封","");
    sub = sub.replace("BIG5","繁");
    sub = sub.replace("JP","");
    sub = sub.replace("GB","简");
    sub = sub.replace("&","");
    sub = sub.replace("语字幕","");
    return sub;
}
export function processMovieTitle(torrentTitle:string){
    logger.debug("Find Movie and OVA now...\n can't process anymore,please find it in /mova.txt,modify yourself and put it into mova.json");
    fs.appendFile('mova.txt',torrentTitle,(err)=>{
        if(err) logger.error(err);
        logger.debug("write to file.")
    })
    return {
        name   : "998454323",
        season : "",
        episode: "",
        sub    : "",//字幕类型(简繁E)
        dpi    : "",//清晰度
        source : "",//bilibili AT-X...
        group  : "",//字幕组
        torrent: "",//torrentUrl;
        dow    : "",//星期几
        cover  : "",//封面
        bgmId  : "",//mikanani.id
    }
}
export function processAnimeTitle(torrentTitle:string):bangumiTorrent {
    torrentTitle = torrentTitle.trim();
    const contentTitle = process_prefix(torrentTitle);
    const group = getGroup(contentTitle);
    const match_obj = contentTitle.match(title_re);
    const [seasonInfo,episodeInfo, other] = match_obj?.slice(1).map(x => x.trim()) || [];
    if(seasonInfo === undefined ){
        console.log(torrentTitle);
        console.log(contentTitle);
        console.log(group);
        console.log(match_obj);
        return {
            name   : "998454323",
            season : "",
            episode: "",
            sub    : "",//字幕类型(简繁E)
            dpi    : "",//清晰度
            source : "",//bilibili AT-X...
            group  : "",//字幕组
            torrent: "",//torrentUrl;
            dow    : "",//星期几
            cover  : "",//封面
            bgmId  : "",//mikanani.id
        }
    }
    const processRaw = prefixProcess(seasonInfo,group);
    const [raw_name, season_raw, season] = processSeason(processRaw);//季 名字
    const episode = episodeInfo.match(episode_re);//集数
    const [sub,dpi,source] = find_tags(other);
    return {
        name   : raw_name,
        season : season,
        episode: `${parseInt(episode?episode.join(""):"0")}`,
        sub    : processSub(sub || ""),//字幕类型(简繁E)
        dpi    : dpi|| "",//清晰度
        source : source||"",//bilibili AT-X...
        group  : group,//字幕组
        torrent: "",//torrentUrl;
        dow    : "",//星期几
        cover  : "",//封面
        bgmId  : "",//mikanani.id
    }
}
// function getGroup(title: string):string {
//     const match = title.match(/[\[\]]/);
//     return  match ? match[0]:"";
// }


