/** 条纹：默认蓝（.cbc-card 基色）↔ 绿，仅两种交替 */
export function cbcCardStripeClass(index: number): string {
  return index % 2 === 1 ? "cbc-card--green" : "";
}
