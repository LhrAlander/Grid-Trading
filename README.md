# 自动交易
试图在熊市震荡期对主流币种进行自动交易，让机器来无情高抛低吸。

# 平台
目前调研后会选择币安，手续费较低。

# 策略
1. 需要自己设置第一笔买入的价格，比如1000usdt/eth
2. 会在价格小于等于 1000 的时候 自动买入价值 config.json.needBuyAnchorAmount 个usdt的eth，并在db.json中新增一条记录
3. 下一次买入的价格为最近一次交易（买或卖）的平均成交价的(1 - config.json.buyDownRate)
4. 买入时会设置这一次买入操作所得的eth需要卖出的价格为该次交易的平均成交价的（1 + config.json.sellUpRate)
5. 每隔2s查询一次价格

# 操作步骤
1. 在db.json中新增一条记录:
````
{
        "tid": "",
        "tradeStatus": 4,
        "operatingPrice": 1234.27,
        "operatingAmount": 15.724,
        "tradingType": 1,
        // 主要是这个nextBuyPrice，就是下一次加仓的价格临界点
        "nextBuyPrice": 11720.56
}
````
2. 一次交易金额不得低于10usdt，所以config.json.needBuyAnchorAmount 应该>10
3. eth交易的小数位为两位，所以config.json.fixNum应该 <=2 && >=0，直接取2就行
4. config.json.sellUpRate 和 config.json.buyDownRate 自行设置，记住是 < 1
5. db.json中的记录主要观察下 nextBuyPrice 和 needSellPrice符不符合要求，如有问题可反馈

# 免责声明
该项目只做为个人学习使用，如造成任何损失本人概不负责。
