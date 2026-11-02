export const SILO_MATERIALS=Object.freeze({
 concrete:{tile:0,repeat:3,color:[.94,.96,.96],roughness:.95},seafoam:{tile:1,repeat:2,color:[1,1,1],roughness:.77,metalness:.12},
 ivory:{tile:2,repeat:2.5,color:[1,1,1],roughness:.86},steel:{tile:3,repeat:1.5,color:[1,1,1],roughness:.68,metalness:.22},
 floor:{tile:0,repeat:2.5,color:[.76,.79,.76],roughness:.98},rubber:{tile:null,repeat:1,color:[.055,.065,.06],roughness:1},
 brass:{tile:null,repeat:1,color:[.54,.43,.20],roughness:.62,metalness:.35},yellow:{tile:null,repeat:1,color:[.84,.58,.13],roughness:.84},
 red:{tile:null,repeat:1,color:[.47,.12,.08],roughness:.84},glass:{tile:null,repeat:1,color:[.09,.19,.17],roughness:.34,metalness:.2},
 dark:{tile:null,repeat:1,color:[.07,.085,.08],roughness:.91},linen:{tile:2,repeat:2,color:[.68,.70,.61],roughness:1}
});
for(const spec of Object.values(SILO_MATERIALS))Object.freeze(spec);

export const levelY=i=>Math.round((i-22)*2.12*1e6)/1e6;
export const SILO_PLAN={nativeToWorld:{translation:[0,46.64,0],inverseTranslation:[0,-46.64,0]}};
export function buildSiloMesh(){throw Error('Coldwell adapter requires verified prebuilt mesh data.');}
