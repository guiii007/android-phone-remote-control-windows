// Only acknowledged images become the next desktop baseline on the host.
export class FrameBuffer {
  constructor(createCanvas=()=>document.createElement('canvas')) {this.createCanvas=createCanvas;this.reset();}
  reset(){this.canvas=null;}
  apply(image,patch){
    if(!patch){this.reset();return image;}
    const {x,y,width,height,screenWidth,screenHeight}=patch;
    if(![x,y,width,height,screenWidth,screenHeight].every(Number.isInteger)||x<0||y<0||width<1||height<1||screenWidth<1||screenHeight<1||screenWidth>1280||screenHeight>720||x+width>screenWidth||y+height>screenHeight||image.width!==width||image.height!==height)throw Error('Invalid desktop patch');
    if(!this.canvas||this.canvas.width!==screenWidth||this.canvas.height!==screenHeight){
      if(x!==0||y!==0||width!==screenWidth||height!==screenHeight)throw Error('Missing desktop baseline');
      this.canvas=this.createCanvas();this.canvas.width=screenWidth;this.canvas.height=screenHeight;
    }
    this.canvas.getContext('2d').drawImage(image,x,y);
    return this.canvas;
  }
}
