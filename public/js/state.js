export const app = {user:null,model:null,setId:null,scope:[],scopeChildren:true,page:'home',filter:'all',query:'',
  selectedCards:new Set(),session:null,mode:'review',game:'mix',face:'meaning',status:'',busy:false,dirty:false,register:false};
export const words = () => Object.values(app.model.words).filter(w=>!w.deleted&&w.setId===app.setId);
export const current = () => app.session?.queue[app.session.index];
