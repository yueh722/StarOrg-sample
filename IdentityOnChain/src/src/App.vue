<template>
  <div class="app-container">
    <!-- 导航栏 -->
    <nav>
      <router-link to="/">Home</router-link> |
      <router-link to="/dashboard">區塊鏈管理平台</router-link> |
      <router-link to="/person">人员管理</router-link> |
      <router-link to="/test">Test</router-link>
    </nav>

    <!-- 路由视图 -->
    <router-view></router-view>
  </div>
</template>

<script>
export default {
  name: 'App',
};
</script>

<style>
/* 全局样式重置 */
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

/* 应用容器 */
.app-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start; /* 顶部对齐 */
  min-height: 100vh; /* 使容器占满整个视口高度 */
  padding: 20px;
  box-sizing: border-box;
  width: 100%; /* 确保容器占满宽度 */
}

/* 导航栏样式 */
nav {
  margin-bottom: 20px;
}

nav a {
  text-decoration: none;
  color: #42b983;
  font-weight: bold;
  margin: 0 10px;
}

nav a:hover {
  text-decoration: underline;
}

/* 路由视图样式 */
router-view {
  width: 100%; /* 确保路由视图占满父容器宽度 */
  max-width: 800px; /* 限制内容的最大宽度 */
  margin: 0 auto; /* 水平居中 */
}

</style>