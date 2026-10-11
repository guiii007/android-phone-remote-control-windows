export const TEXT_LEFT=344, TEXT_RIGHT=938;
export function deletionRange(text,start,end){
  if(start!==end||start===0)return {start,end};
  // UTF-16 光标位置：组合 emoji 和带重音字符一次删完整个字。
  let previous=0;
  for(const segment of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
    if(segment.index>=start)break;
    previous=segment.index;
  }
  return {start:previous,end:start};
}
export function textCells(text){let x=0;return Array.from(text,(char,index)=>{const width=/^[\x20-\x7e]$/.test(char)?14:26;const cell={char,index,x,width};x+=width;return cell;});}
export function textOffset(text,index){const cells=textCells(text);return index>=cells.length?cells.reduce((sum,c)=>sum+c.width,0):cells[Math.max(0,index)].x;}
export function textIndexAt(text,x,scroll=0){const cells=textCells(text),target=x-TEXT_LEFT+scroll;for(const c of cells)if(target<c.x+c.width/2)return c.index;return cells.length;}
