export function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
export function screenDeltaToLocal(dx,dy,rotated){return rotated?{dx:dy,dy:-dx}:{dx,dy};}
export function shouldRotatePage({wanted,width,height,nativeEditing}){return wanted&&height>width&&!nativeEditing;}
export function desktopTransform({width,height,stageWidth,stageHeight}){
  const scale=Math.min(stageWidth/width,stageHeight/height);
  return {scale,tx:(stageWidth-width*scale)/2,ty:(stageHeight-height*scale)/2};
}
