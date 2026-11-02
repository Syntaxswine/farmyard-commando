// Existing Farmyard stable heap, shared by flat and optional spatial navigation.
export class PathFrontier{
  constructor(){this.items=[];this.sequence=0;}
  before(a,b){return a.f<b.f||a.f===b.f&&a.order<b.order;}
  push(point){const p={...point,order:this.sequence++},items=this.items;let i=items.length;items.push(p);while(i){const parent=(i-1)>>1;if(!this.before(p,items[parent]))break;items[i]=items[parent];i=parent;}items[i]=p;}
  pop(){const items=this.items,first=items[0],last=items.pop();if(items.length){let i=0;while(i*2+1<items.length){let child=i*2+1;if(child+1<items.length&&this.before(items[child+1],items[child]))child++;if(!this.before(items[child],last))break;items[i]=items[child];i=child;}items[i]=last;}return first;}
}
