const parser = require('./parser');

function isSome(x){
  return x !== null && x !== undefined;
}
// console.log(isSome(null))
// console.log(isSome(undefined))
// console.log(isSome(false))

function isCapitalized(x){
  return x && (x[0] === x[0].toUpperCase());
}

function flatten(x){
  return x.reduce((acc, x)=> {
    if(Array.isArray(x)){
      // todo replace with array modification
      acc = acc.concat(x);
    } else {
      acc.push(x);
    }
    return acc;
  }, []);
}

function arraify(x){
  if(Array.isArray(x)){ return x; }
  if(isSome(x)){ return [x]; }
  return [];
}

var InvocationExpression = (ctx, result, expr)=> {
  // console.log('InvocationExpression', expr);
  return expr.children.reduce((acc, ch)=>{
    return doEval(ctx, acc, ch);
  }, result);
};

var TermExpression = (ctx, result, expr)=> {
  // console.log('TermExpression', expr.text, expr);
  return doEval(ctx,result, expr.children[0]);
};

var LiteralTerm = (ctx, result, expr)=> {
  var term = expr.children[0];
  if(term){
    return doEval(ctx, result, term); 
  } else {
    return expr.text;
  }
};

var StringLiteral = (ctx, result, expr)=> {
  return expr.text.replace(/(^['"]|['"]$)/g, '');
};

var NumberLiteral = (ctx, result, expr)=> {
  return parseInt(expr.text);
};

var Identifier = (ctx, result, expr)=> {
  return expr.text.replace(/(^"|"$)/g, '');
};

var InvocationTerm = (ctx, result, expr)=> {
  // console.log('InvocationTerm', expr.text, expr);
  return doEval(ctx,result, expr.children[0]);
};

var MemberInvocation = (ctx, result ,expr )=> {
  const key = doEval(ctx, result, expr.children[0]);
  // console.log('MemberInvocation', key, expr);

  if (result) {
    if(isCapitalized(key)) {
      if(Array.isArray(result)){
        return result.filter((x)=> { return x.resourceType === key; });
      } else {
        if(result.resourceType === key){
          return result;
        } else {
          return null;
        }
      }
    } else {
      if(result[key]) {
        return result[key];
      } else if (Array.isArray(result)) {
        return result.reduce((acc, res)=> {
          var toAdd = res[key];
          if(isSome(toAdd)) {
            if(Array.isArray(toAdd)) {
              // replace with array modification
              acc = acc.concat(toAdd);
            } else {
              acc.push(toAdd);
            }
            return acc;
          } else {
            return acc;
          }
        }, []);
      } else {
        return null;
      }
    }
  } else {
    return null;
  }
};

var IndexerExpression = (ctx, result, expr) => {
  const coll_expr = expr.children[0];
  const idx_expr = expr.children[1];
  var coll = doEval(ctx, result, coll_expr);
  var idx = doEval(ctx, result, idx_expr);
  var idx = idx && parseInt(idx);
  // console.log('IndexerExpression', expr,"\ncoll\n", coll, "\n", idx);
  if(coll) {
    return coll[idx] || null;
  } else {
    return null; 
  }
};

var Functn = (ctx, result, expr) => {
  // console.log('Funcn', expr);
  return expr.children.map((x)=> {
    return doEval(ctx, result, x);
  });
};


var whereMacro = (ctx, result, expr) => {
  // console.log('whereMacro', result, expr);
  if(result !== false && ! result) { return null; }

  var lambda = expr[0].children[0];

  if(Array.isArray(result)){
    return flatten(result.filter((x)=> {
      var exprRes = doEval(ctx, x, lambda);
      // console.log('filter expr', exprRes, x, lambda);
      return exprRes; 
    }));
  } else if (result) {
    if(doEval(ctx, result, lambda)) {
      return result;
    } else {
      return null;
    }
  }
  return result;
};

var selectMacro = (ctx, result, expr) => {
  // console.log('selectMacro', result, expr);
  if(result !== false && ! result) { return null; }

  var lambda = expr[0].children[0];

  return flatten(arraify(result).map((x)=> {
    // console.log('map', doEval(ctx, x, lambda));
    return doEval(ctx, x, lambda);
  }));
};

var repeatMacro = (ctx, result, expr) => {
  // console.log('selectMacro', result, expr);
  if(result !== false && ! result) { return null; }

  var lambda = expr[0].children[0];
  var res = [];
  var items = arraify(result);

  var next = null;
  var lres = null;
  while (items.length != 0) {
    next = items.shift();
    lres = flatten(arraify(doEval(ctx, next, lambda)));
    if(lres){
      res = res.concat(lres);
      items = items.concat(lres);
    }
  }
  return res;
};

const macroTable = {
  where: whereMacro,
  select: selectMacro,
  repeat: repeatMacro
};


var existsFn  = (x) => {
  // console.log('exits', x, !!x);
  return !!x;
};

var emptyFn = (x) => {
  if(x){
    return x.length == 0;
  } else {
    return true;
  }
};

// 5.1.13. count() : integer Returns a collection with a single value which is
// the integer count of the number of items in the input collection. Returns 0
// when the input collection is empty.

var countFn = (x)=>{
  return x && x.length; 
};

var traceFn = (x, args)=>{
  // console.log('TRACE:[' + JSON.stringify(args) + ']', x);
  console.log('TRACE:', x);
  return x;
};


const fnTable = {
  exists:  existsFn,
  empty: emptyFn,
  count: countFn,
  trace: traceFn
};

var FunctionInvocation = (ctx, result, expr) => {
  var args = doEval(ctx, result, expr.children[0]);
  const fnName = args[0];
  args.shift();
  // console.log('FunctionInvocation', expr.text, fnName, args);
  var macro = macroTable[fnName];
  if(macro){
    return macro.call(this, ctx, result, args);
  } else {
    var fn = fnTable[fnName];
    if(fn){
      //TODO: eval args before calling function
      return fn.call(this, result, args); 
    } else {
      throw new Error("No function [" + fnName + "] defined ");
    }
  }
  return null;
};

var ParamList = (ctx, result, expr) => {
  // we do not eval param list because sometimes it should be passed as
  // lambda/macro (for example in case of where(...)
  return expr;
};

function doCompare(x,y){
  // console.log('comapre', x, '=', y, x == y );
  // TODO: should be smart to compare list monads :0
  return x == y;
}

var EqualityExpression = (ctx, result, expr) => {
  // console.log("EqualityExpression", expr);

  var left = doEval(ctx, result, expr.children[0]);
  var right = doEval(ctx, result, expr.children[1]);
  return doCompare(left, right);
};

var UnionExpression = (ctx, result, expr) => {
  // console.log("EqualityExpression", expr);
  var left = doEval(ctx, result, expr.children[0]);
  var right = doEval(ctx, result, expr.children[1]);
  return arraify(left).concat(arraify(right));
};

const evalTable = {
  EqualityExpression: EqualityExpression,
  FunctionInvocation: FunctionInvocation,
  Functn: Functn,
  Identifier: Identifier,
  IndexerExpression: IndexerExpression,
  InvocationExpression: InvocationExpression,
  InvocationTerm: InvocationTerm,
  LiteralTerm: LiteralTerm,
  MemberInvocation: MemberInvocation,
  NumberLiteral: NumberLiteral,
  ParamList: ParamList,
  StringLiteral: StringLiteral,
  TermExpression: TermExpression,
  UnionExpression: UnionExpression
};

var doEval = (ctx, result, expr) => {
  const evaluator = evalTable[expr.type];
  if(evaluator){
    return evaluator(ctx, result, expr);
  } else {
    throw new Error("No " + expr.type + " evaluator ");
  }
};

var evaluate = (resource, path) => {
  const expr = parser.parse(path);
  return doEval({}, resource, expr.children[0]);
};

var compile = (path)=> {
  return (resource)=>{};
};

module.exports = {
  parse: parser.parse,
  compile: compile,
  evaluate: evaluate
};