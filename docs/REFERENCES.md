# 科学与软件参考

## 浏览器细胞模型框架

1. Wortel IMN, Textor J. *Artistoo, a library to build, share, and explore simulations of cells and tissues in the web browser.* eLife. 2021;10:e61288. DOI: 10.7554/eLife.61288. Artistoo 为 MIT 许可证的纯 JavaScript Cellular Potts 框架。v4 未嵌入其源码，但参考了其“可探索、零后端浏览器模型”的工程路径。
2. Artistoo 官方网站与用户手册：https://artistoo.net/

## 可变形细胞与组织力学

3. Boromand A, et al. *Jamming of Deformable Polygons.* Phys Rev Lett. 2018. arXiv:1801.06150. 可变形粒子模型使用面积、周长和接触排斥描述细胞形状与拥堵。
4. Alert R, Trepat X. *Physical Models of Collective Cell Migration.* Annu Rev Condens Matter Phys. 2020. 讨论自驱粒子、顶点、相场等模型的适用范围。
5. Buttenschön A, Edelstein-Keshet L. *Bridging from single to collective cell migration: A review of models and links to experiments.* PLoS Comput Biol. 2020.
6. Löber J, et al. *Multiphase field models for collective cell migration.* PLoS Comput Biol. 2022.

## 细胞核与受限迁移

7. Davidson PM, et al. *Nuclear deformability constitutes a rate-limiting step during cell migration in 3-D environments.* Cell Mol Bioeng. 2014.
8. Wolf K, et al. *Physical limits of cell migration: control by ECM space and nuclear deformation and tuning by proteolysis and traction force.* J Cell Biol. 2013.
9. McGregor AL, et al. *Squish and squeeze—the nucleus as a physical barrier during migration in confining environments.* Curr Opin Cell Biol. 2016.
10. He M, et al. *Multicompartment cell-based modeling of confined migration: regulation by cell intrinsic and extrinsic factors.* Biophys J. 2018.

## 肿瘤出芽定义

11. Lugli A, et al. *Recommendations for reporting tumor budding in colorectal cancer based on the International Tumor Budding Consensus Conference (ITBCC) 2016.* Mod Pathol. 2017. 肿瘤芽定义为单个肿瘤细胞或最多 4 个细胞的小簇。

## 引用边界

上述文献支持模型结构选择，不代表 v4 已经过这些论文中的实验数据校准或验证。所有参数仍为定性归一化参数。


## v4 新增机制参考

12. Dynamic leader-cell selection and mechanical competition studies informed frontness, traction asymmetry, stress-dependent turnover, and replacement.
13. Degradable and remodelable ECM migration models informed the qualitative density–damage–fiber feedback; no parameter values were copied.
14. Artistoo PerimeterConstraint and ActivityConstraint documentation informed the separation of shape constraints and protrusive activity; no runtime code was embedded.
