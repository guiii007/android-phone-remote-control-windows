// 在手机最终显示尺寸上使用 GPU 做轻量锐化，不修改网络图片、鼠标坐标或文字内容。
const vertex=`attribute vec2 position;attribute vec2 uv;varying vec2 tex;
void main(){tex=uv;gl_Position=vec4(position,0.0,1.0);}`;
const fragment=`precision mediump float;uniform sampler2D image;uniform vec2 stepSize;
uniform float amount;varying vec2 tex;
void main(){
  vec3 c=texture2D(image,tex).rgb;
  vec3 l=texture2D(image,tex-vec2(stepSize.x,0.0)).rgb;
  vec3 r=texture2D(image,tex+vec2(stepSize.x,0.0)).rgb;
  vec3 t=texture2D(image,tex-vec2(0.0,stepSize.y)).rgb;
  vec3 b=texture2D(image,tex+vec2(0.0,stepSize.y)).rgb;
  vec3 lo=min(c,min(min(l,r),min(t,b))),hi=max(c,max(max(l,r),max(t,b)));
  // 局部范围限制，抑制文字边缘的亮边与暗边；不会生成不存在的笔画。
  gl_FragColor=vec4(clamp(c+amount*(c-(l+r+t+b)*0.25),lo,hi),1.0);
}`;

export class PhoneEnhancer {
  constructor(createCanvas=()=>document.createElement('canvas')) {
    this.canvas=createCanvas();this.gl=null;this.reason='';this.cached=null;this.samples=0;this.slow=0;
    try {
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
      if(!gl)throw Error('当前浏览器不支持增强，使用原画');
      this.gl=gl;
      const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('增强初始化失败，使用原画');return shader;};
      const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('增强初始化失败，使用原画');
      gl.deleteShader(vs);gl.deleteShader(fs);this.program=program;gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      // DOM 图片的顶端对应纹理坐标 0；下方顶点读取纹理底端，保持图像方向。
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0]),gl.STATIC_DRAW);
      for(const [name,offset] of [['position',0],['uv',8]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,16,offset);}
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program,'image'),0);
      this.step=gl.getUniformLocation(program,'stepSize');this.amount=gl.getUniformLocation(program,'amount');
      this.limit=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.canvas.addEventListener('webglcontextlost',()=>this.disable('增强暂不可用，已切回原画'));
    } catch(error) {this.disable(error.message);}
  }
  disable(reason){this.reason=reason;this.cached=null;}
  retry(){if(this.gl&&!this.gl.isContextLost()){this.reason='';this.cached=null;this.samples=0;this.slow=0;}}
  render(image,width,height,strength=1.05) {
    const gl=this.gl;
    if(this.reason||!gl||gl.isContextLost())return image;
    const scale=Math.min(1,this.limit/Math.max(width,height));
    width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));
    strength=Math.max(0,Math.min(1.5,strength));
    if(this.cached?.image===image&&this.cached.width===width&&this.cached.height===height&&this.cached.strength===strength)return this.canvas;
    try {
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
      gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,this.texture);
      if(image.width>this.limit||image.height>this.limit)throw Error('图片超过增强能力，使用原画');
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.uniform2f(this.step,1/image.width,1/image.height);gl.uniform1f(this.amount,strength);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if(gl.getError()!==gl.NO_ERROR)throw Error('增强暂不可用，已切回原画');
      this.cached={image,width,height,strength};return this.canvas;
    } catch(error) {this.disable(error.message);return image;}
  }
  recordCost(ms) {
    // 跳过初始化热身；连续三帧处理较慢时让原画保持操作响应。
    if(++this.samples<=2)return;
    this.slow=ms>30?this.slow+1:0;
    if(this.slow>=3)this.disable('为保持流畅，暂时使用原画');
  }
}
